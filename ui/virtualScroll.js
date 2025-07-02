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
import { Task, saveToStorage } from '../services/storage.js';
import { recalculateAllLanes } from '../core/laneEngine.js';

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

    // 時刻ラベル作成（30分単位表示、15分刻みクリック対応）
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const totalMinutes = hour * 60 + minute;
        const timeLabel = document.createElement('div');
        
        // 30分間隔なので全てメジャー時刻扱い
        timeLabel.className = 'time-label major';
        timeLabel.dataset.hour = hour;
        timeLabel.dataset.minute = minute;
        timeLabel.dataset.totalMinutes = totalMinutes;
        
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        timeLabel.textContent = timeString;
        
        timeLabel.style.cssText = `
          position: absolute;
          left: 8px;
          top: ${totalMinutes - 8}px;
          font-size: 12px;
          color: var(--gray-600);
          font-weight: 500;
          background: var(--background);
          padding: 2px 4px;
          border-radius: 2px;
          z-index: 120;
          cursor: pointer;
          transition: all 0.2s ease;
        `;
        
        // ホバー効果
        timeLabel.addEventListener('mouseenter', () => {
          timeLabel.style.background = 'var(--primary)';
          timeLabel.style.color = 'white';
          timeLabel.style.fontWeight = '600';
        });
        
        timeLabel.addEventListener('mouseleave', () => {
          timeLabel.style.background = 'var(--background)';
          timeLabel.style.color = 'var(--gray-600)';
          timeLabel.style.fontWeight = '500';
        });
        
        // クリックイベント：その時間にタスクを追加（15分刻み対応）
        timeLabel.addEventListener('click', (e) => {
          e.stopPropagation();
          createTaskAtTime(dateString, hour, minute);
        });
        
        timeline.appendChild(timeLabel);
      }
    }

    // 15分刻みの非表示クリック領域を追加（UX向上）
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 15; minute < 60; minute += 30) { // 15分と45分のみ
        const totalMinutes = hour * 60 + minute;
        const clickArea = document.createElement('div');
        
        clickArea.className = 'time-click-area';
        clickArea.dataset.hour = hour;
        clickArea.dataset.minute = minute;
        clickArea.dataset.totalMinutes = totalMinutes;
        
        clickArea.style.cssText = `
          position: absolute;
          left: 0;
          top: ${totalMinutes - 15}px;
          right: 0;
          height: 30px;
          z-index: 115;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s ease;
        `;
        
        // ホバー時に15分刻み時刻を表示
        clickArea.addEventListener('mouseenter', () => {
          const tooltip = document.createElement('div');
          const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          tooltip.textContent = timeString;
          tooltip.className = 'time-tooltip';
          tooltip.style.cssText = `
            position: absolute;
            left: 8px;
            top: ${totalMinutes - 8}px;
            font-size: 10px;
            color: var(--primary);
            font-weight: 600;
            background: rgba(46, 139, 255, 0.1);
            padding: 2px 4px;
            border-radius: 2px;
            z-index: 125;
            pointer-events: none;
          `;
          timeline.appendChild(tooltip);
          clickArea._tooltip = tooltip;
        });
        
        clickArea.addEventListener('mouseleave', () => {
          if (clickArea._tooltip && clickArea._tooltip.parentNode) {
            clickArea._tooltip.parentNode.removeChild(clickArea._tooltip);
            clickArea._tooltip = null;
          }
        });
        
        // 15分刻みでのタスク作成
        clickArea.addEventListener('click', (e) => {
          e.stopPropagation();
          createTaskAtTime(dateString, hour, minute);
        });
        
        timeline.appendChild(clickArea);
      }
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
 * タイムラインクリック時にタスクを作成
 * @param {string} dateString - 対象日付
 * @param {number} hour - 時間（0-23）
 * @param {number} minute - 分（0,15,30,45）
 */
function createTaskAtTime(dateString, hour, minute) {
  try {
    const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    // 1時間後の終了時刻を計算（15分単位でスナップ）
    let endHour = hour;
    let endMinute = minute + 60;
    
    if (endMinute >= 60) {
      endHour = (endHour + 1) % 24;
      endMinute = endMinute % 60;
    }
    
    // 15分単位にスナップ
    endMinute = Math.round(endMinute / 15) * 15;
    if (endMinute >= 60) {
      endHour = (endHour + 1) % 24;
      endMinute = 0;
    }
    
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
    
    // インライン入力でタスク名を取得
    showInlineInput(
      `${startTime}のタスクを追加`,
      'タスク名を入力してください',
      '新しいタスク',
      (title) => {
        // タスク作成処理
        const newTask = new Task(
          null, // ID自動生成
          title.trim(),
          startTime,
          endTime,
          'normal',
          dateString
        );
        
        // AppStateに追加
        if (window.AppState) {
          window.AppState.tasks.push(newTask);
          saveToStorage();
          recalculateAllLanes();
          
          // 該当日付パネルを再描画
          const panel = document.querySelector(`[data-date="${dateString}"]`);
          if (panel) {
            renderTasksToPanel(dateString, panel);
          }
          
          console.log('✅ タイムラインクリックでタスク作成:', {
            title: newTask.title,
            time: `${startTime}-${endTime}`,
            date: dateString,
            id: newTask.id
          });
          
          // 作成成功のフィードバック（短時間だけ表示）
          showTaskCreatedFeedback(startTime);
        }
      }
    );
    
    return; // 関数を抜ける（非同期処理のため）
    
  } catch (error) {
    console.error('タイムラインタスク作成エラー:', error);
    alert('タスクの作成に失敗しました。もう一度お試しください。');
  }
}

/**
 * タスク作成成功のフィードバック表示
 * @param {string} time - 作成した時刻
 */
function showTaskCreatedFeedback(time) {
  const feedback = document.createElement('div');
  feedback.textContent = `✅ ${time}にタスクを追加しました`;
  feedback.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    background: var(--primary);
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-weight: 600;
    z-index: 1000;
    animation: slideInFade 0.3s ease-out;
  `;
  
  document.body.appendChild(feedback);
  
  // 2秒後に自動削除
  setTimeout(() => {
    feedback.style.animation = 'slideOutFade 0.3s ease-in';
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 300);
  }, 2000);
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
    const mainClock = document.getElementById('main-clock');
    if (mainClock) {
      // 現在時刻を取得
      const now = new Date();
      const timeString = now.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
      });
      mainClock.textContent = `${date} ${timeString}`;
    }

    // AppStateのcurrentDateも更新
    if (window.AppState) {
      window.AppState.currentDate = date;
    }

    // URLも更新
    updateURL(date);
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
  } else if (e.key === 't' || e.key === 'T') {
    e.preventDefault();
    // jumpToTodayがグローバル関数として定義されているかチェック
    if (typeof window.jumpToToday === 'function') {
      window.jumpToToday();
    } else {
      console.warn('jumpToToday関数が見つかりません');
    }
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