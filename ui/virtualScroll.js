/**
 * 仮想スクロール機能（Testing Trophy: E2E Level）
 * IntersectionObserver + History API による無限日付スクロール
 *
 * @author Kent C. Dodds Testing Trophy準拠の高レベル統合
 */

import {
  getNextDate,
  getPrevDate,
  formatDateForDisplay,
  getCurrentDateString,
  getDayOfWeek
} from '../core/timeUtils.js';
import { assignLanes, updateGridLayout } from '../core/laneEngine.js';
import { createTaskCard } from './taskCard.js';

/**
 * 仮想スクロール用グローバル状態
 */
const virtualizedDays = new Map(); // dateString -> HTMLElement
let intersectionObserver = null;
let scrollContainer = null;
let currentDate = getCurrentDateString();

/**
 * URL同期機能
 */
function updateURL(date) {
  try {
    const url = new URL(window.location);
    url.searchParams.set('date', date);
    window.history.replaceState(null, '', url);
  } catch (error) {
    console.error('URL更新エラー:', error);
  }
}

function restoreDateFromURL() {
  try {
    const url = new URL(window.location);
    const dateFromURL = url.searchParams.get('date');

    if (dateFromURL && /^\d{4}-\d{2}-\d{2}$/.test(dateFromURL)) {
      return dateFromURL;
    }
    return getCurrentDateString();
  } catch (error) {
    console.error('URL復元エラー:', error);
    return getCurrentDateString();
  }
}

/**
 * 日付パネル作成（メイン関数）
 * @param {string} dateString - YYYY-MM-DD形式の日付
 * @returns {HTMLElement} 日付パネル要素
 */
export function createDayPanel(dateString) {
  try {
    const panel = document.createElement('div');
    panel.className = 'day-panel';
    panel.dataset.date = dateString;
    panel.style.cssText = `
      min-height: 1440px;
      position: relative;
      border-bottom: 1px solid var(--gray-300);
      scroll-snap-align: start;
    `;

    // 日付ヘッダー
    const header = document.createElement('div');
    header.className = 'day-panel-header';
    header.style.cssText = `
      position: sticky;
      top: 60px;
      background: var(--background);
      padding: 8px 16px;
      border-bottom: 2px solid var(--primary);
      z-index: 150;
      font-weight: 600;
      color: var(--primary);
    `;
    header.textContent = `${formatDateForDisplay(dateString)}`;
    panel.appendChild(header);

    // タイムライングリッド（24時間）
    const timeline = document.createElement('div');
    timeline.className = 'timeline-grid';
    timeline.setAttribute('role', 'grid');
    timeline.setAttribute('aria-label', `${formatDateForDisplay(dateString)}のタイムライン`);
    timeline.style.cssText = `
      position: relative;
      height: 1440px;
      background: linear-gradient(
        to bottom,
        transparent 0px,
        transparent 59px,
        var(--gray-200) 59px,
        var(--gray-200) 60px,
        transparent 60px
      );
      background-size: 100% 60px;
    `;

    // 時刻ラベル作成（0:00 - 23:00）
    for (let hour = 0; hour < 24; hour++) {
      const timeLabel = document.createElement('div');
      timeLabel.className = 'time-label';
      timeLabel.dataset.hour = hour;
      timeLabel.textContent = `${hour}:00`;
      timeLabel.style.cssText = `
        position: absolute;
        left: 8px;
        top: ${hour * 60 - 8}px;
        font-size: 12px;
        color: var(--gray-600);
        font-weight: 500;
        background: var(--background);
        padding: 2px 4px;
        border-radius: 2px;
        z-index: 120;
      `;
      timeline.appendChild(timeLabel);
    }

    // 現在時刻ライン（今日のみ）
    if (dateString === getCurrentDateString()) {
      const nowLine = document.createElement('div');
      nowLine.id = `now-line-${dateString}`;
      nowLine.className = 'now-line';
      nowLine.setAttribute('role', 'separator');
      nowLine.setAttribute('aria-label', '現在時刻ライン');
      nowLine.style.cssText = `
        position: absolute;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--accent);
        z-index: 110;
        box-shadow: 0 0 4px rgba(239, 68, 68, 0.5);
      `;
      timeline.appendChild(nowLine);

      // 現在時刻に配置
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      nowLine.style.top = currentMinutes + 'px';
    }

    // Intersection Observer用のセンチネル
    const topSentinel = document.createElement('div');
    topSentinel.className = 'intersection-sentinel top-sentinel';
    topSentinel.dataset.date = dateString;
    topSentinel.dataset.direction = 'up';
    topSentinel.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 1px;
      pointer-events: none;
    `;

    const bottomSentinel = document.createElement('div');
    bottomSentinel.className = 'intersection-sentinel bottom-sentinel';
    bottomSentinel.dataset.date = dateString;
    bottomSentinel.dataset.direction = 'down';
    bottomSentinel.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 1px;
      pointer-events: none;
    `;

    panel.appendChild(timeline);
    panel.appendChild(topSentinel);
    panel.appendChild(bottomSentinel);

    return panel;

  } catch (error) {
    console.error('日付パネル作成エラー:', error);
    return createErrorPanel(dateString, error.message);
  }
}

/**
 * エラー用パネル作成
 */
function createErrorPanel(dateString, errorMessage) {
  const errorPanel = document.createElement('div');
  errorPanel.className = 'day-panel error-panel';
  errorPanel.dataset.date = dateString;
  errorPanel.innerHTML = `
    <div style="padding: 20px; text-align: center; color: var(--accent);">
      <h3>パネル作成エラー</h3>
      <p>${dateString}</p>
      <p>${errorMessage}</p>
    </div>
  `;
  errorPanel.style.cssText = 'min-height: 1440px; background: #ffebee; border: 2px solid #f44336;';
  return errorPanel;
}

/**
 * 指定日のタスクをパネルにレンダリング
 * @param {string} dateString - 日付文字列
 * @param {HTMLElement} panel - 日付パネル要素
 */
export function renderTasksToPanel(dateString, panel) {
  try {
    if (!panel) {return;}

    const timeline = panel.querySelector('.timeline-grid');
    if (!timeline) {return;}

    // 既存のタスクカードを削除
    const existingCards = timeline.querySelectorAll('.task-card');
    existingCards.forEach(card => card.remove());

    // AppStateから指定日のタスクを取得
    const appState = window.AppState;
    if (!appState || !appState.tasks) {return;}

    const dateTasks = appState.tasks.filter(task => task.date === dateString);
    if (dateTasks.length === 0) {return;}

    // レーン割り当て
    const laneData = assignLanes(dateString);

    // CSS Grid設定
    updateGridLayout(timeline, laneData.maxLanes);

    // パフォーマンス最適化CSS（仮想スクロールコンテナ）
    timeline.style.willChange = 'transform';
    timeline.style.contain = 'layout style';

    // タスクカード作成とレンダリング
    dateTasks.forEach(task => {
      const card = createTaskCard(task);
      timeline.appendChild(card);
    });

    // デバッグ情報
    if (window.location.search.includes('debug=true')) {
      console.log(`📅 ${dateString}: ${dateTasks.length}タスク, ${laneData.maxLanes}レーン`);
    }

  } catch (error) {
    console.error('タスクレンダリングエラー:', error);
  }
}

/**
 * 表示日数の確保（仮想化のコア機能）
 * @param {string} centerDate - 中心となる日付
 */
export function ensureVisibleDays(centerDate) {
  try {
    if (!scrollContainer) {return;}

    const today = getCurrentDateString();
    const requiredDates = [
      getPrevDate(centerDate),
      centerDate,
      getNextDate(centerDate)
    ];

    // 不要なパネルを削除（メモリ効率）
    virtualizedDays.forEach((panel, date) => {
      if (!requiredDates.includes(date)) {
        panel.remove();
        virtualizedDays.delete(date);
      }
    });

    // 必要なパネルを作成
    requiredDates.forEach(date => {
      if (!virtualizedDays.has(date)) {
        const panel = createDayPanel(date);
        virtualizedDays.set(date, panel);

        // パネルを適切な位置に挿入
        const existingPanels = Array.from(virtualizedDays.entries())
          .sort(([a], [b]) => a.localeCompare(b));

        const insertIndex = existingPanels.findIndex(([d]) => d === date);
        if (insertIndex === 0) {
          scrollContainer.prepend(panel);
        } else if (insertIndex === existingPanels.length - 1) {
          scrollContainer.appendChild(panel);
        } else {
          const nextPanel = existingPanels[insertIndex + 1][1];
          scrollContainer.insertBefore(panel, nextPanel);
        }

        // タスクをレンダリング
        renderTasksToPanel(date, panel);
      }
    });

    // 現在日付の更新
    currentDate = centerDate;
    updateURL(centerDate);

    // ヘッダーの日付表示更新
    updateHeaderDate(centerDate);

  } catch (error) {
    console.error('表示日数確保エラー:', error);
  }
}

/**
 * ヘッダーの日付表示を更新
 */
function updateHeaderDate(date) {
  try {
    const headerDate = document.getElementById('header-date');
    if (headerDate) {
      headerDate.textContent = formatDateForDisplay(date);
    }
  } catch (error) {
    console.error('ヘッダー日付更新エラー:', error);
  }
}

/**
 * IntersectionObserver の初期化
 */
export function initScrollObserver() {
  try {
    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }

    intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const date = entry.target.dataset.date;
          const direction = entry.target.dataset.direction;

          if (direction === 'up') {
            // 上方向スクロール：前の日を表示
            const prevDate = getPrevDate(date);
            ensureVisibleDays(prevDate);
          } else if (direction === 'down') {
            // 下方向スクロール：次の日を表示
            const nextDate = getNextDate(date);
            ensureVisibleDays(nextDate);
          }
        }
      }
    }, {
      root: scrollContainer,
      rootMargin: '20% 0px 20% 0px', // 画面中央20%の領域で検出
      threshold: 0
    });

    // 既存のセンチネルを観察
    virtualizedDays.forEach(panel => {
      const sentinels = panel.querySelectorAll('.intersection-sentinel');
      sentinels.forEach(sentinel => {
        intersectionObserver.observe(sentinel);
      });
    });

  } catch (error) {
    console.error('スクロールオブザーバー初期化エラー:', error);
  }
}

/**
 * 無限スクロールの初期化（メイン関数）
 */
export function initInfiniteScroll() {
  try {
    console.log('🔄 無限スクロール初期化開始');

    // スクロールコンテナの取得（.scroll-containerを優先、なければ.timeline-container）
    scrollContainer = document.querySelector('.scroll-container') || document.querySelector('.timeline-container');
    if (!scrollContainer) {
      throw new Error('スクロールコンテナが見つかりません');
    }

    // CSS設定（.timeline-containerの場合のみ適用）
    if (scrollContainer.classList.contains('timeline-container')) {
      scrollContainer.style.cssText = `
        scroll-snap-type: y mandatory;
        overflow-y: auto;
        height: calc(100vh - 60px);
      `;
    }

    // URLから日付を復元
    const initialDate = restoreDateFromURL();
    currentDate = initialDate;

    // AppStateに現在日付を設定
    if (!window.AppState) {
      window.AppState = {};
    }
    window.AppState.currentDate = currentDate;

    // 初期表示の日数を確保
    ensureVisibleDays(currentDate);

    // IntersectionObserver初期化
    initScrollObserver();

    // 矢印ナビゲーション
    setupArrowNavigation();

    console.log('✅ 無限スクロール初期化完了:', {
      initialDate,
      panelCount: virtualizedDays.size,
      observerActive: !!intersectionObserver
    });

  } catch (error) {
    console.error('無限スクロール初期化エラー:', error);
    throw error;
  }
}

/**
 * 矢印ナビゲーションの設定
 */
function setupArrowNavigation() {
  try {
    // 既存のイベントリスナーを削除
    document.removeEventListener('keydown', handleArrowNavigation);

    // 新しいイベントリスナーを追加
    document.addEventListener('keydown', handleArrowNavigation);

  } catch (error) {
    console.error('矢印ナビゲーション設定エラー:', error);
  }
}

function handleArrowNavigation(e) {
  // 入力フィールドにフォーカスがある場合は無効化
  if (document.activeElement.matches('input, textarea, [contenteditable]')) {
    return;
  }

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    navigateDate(-1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    navigateDate(1);
  }
}

/**
 * 日付ナビゲーション
 * @param {number} direction - 方向（-1: 前日, 1: 翌日）
 */
function navigateDate(direction) {
  try {
    const newDate = direction > 0 ?
      getNextDate(currentDate) :
      getPrevDate(currentDate);

    ensureVisibleDays(newDate);

    // 対象パネルにスムーズスクロール
    const targetPanel = virtualizedDays.get(newDate);
    if (targetPanel) {
      targetPanel.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }

  } catch (error) {
    console.error('日付ナビゲーションエラー:', error);
  }
}

/**
 * 指定日付へのジャンプ
 * @param {string} targetDate - ジャンプ先の日付
 */
export function jumpToDate(targetDate) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      throw new Error('無効な日付形式です');
    }

    ensureVisibleDays(targetDate);

    // ジャンプ先パネルにスクロール
    const targetPanel = virtualizedDays.get(targetDate);
    if (targetPanel) {
      targetPanel.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }

    return true;
  } catch (error) {
    console.error('日付ジャンプエラー:', error);
    return false;
  }
}

/**
 * Testing Trophy対応：仮想スクロールテストユーティリティ
 */
export const VirtualScrollTest = {
  /**
   * 指定日へのジャンプテスト
   */
  jumpToDate: (dateString) => {
    return jumpToDate(dateString);
  },

  /**
   * 表示中の日付一覧取得
   */
  getVisibleDates: () => {
    return Array.from(virtualizedDays.keys()).sort();
  },

  /**
   * スワイプジェスチャーのシミュレーション
   */
  simulateSwipe: (direction) => {
    navigateDate(direction);
    return currentDate;
  },

  /**
   * IntersectionObserver動作テスト
   */
  testObserver: () => {
    if (!intersectionObserver) {return { active: false };}

    // 観察中の要素数を取得
    const observedElements = document.querySelectorAll('.intersection-sentinel');

    return {
      active: true,
      observedCount: observedElements.length,
      panelCount: virtualizedDays.size,
      currentDate
    };
  },

  /**
   * URL同期確認
   */
  checkURLSync: () => {
    const urlDate = restoreDateFromURL();
    return {
      currentDate,
      urlDate,
      synced: currentDate === urlDate
    };
  },

  /**
   * パフォーマンステスト
   */
  measureScrollPerformance: () => {
    const start = performance.now();

    // 複数の日付ジャンプをシミュレート
    const testDates = [
      '2025-01-10',
      '2025-01-15',
      '2025-01-20',
      '2025-01-25'
    ];

    testDates.forEach(date => {
      ensureVisibleDays(date);
    });

    const end = performance.now();

    return {
      testDates: testDates.length,
      executionTime: (end - start).toFixed(2) + 'ms',
      avgTimePerJump: ((end - start) / testDates.length).toFixed(2) + 'ms',
      finalPanelCount: virtualizedDays.size
    };
  }
};

/**
 * 外部からアクセス可能なAPI
 */
export { virtualizedDays, currentDate };

// 日付ナビゲーションを外部からも使用可能に
window.navigateDate = navigateDate;