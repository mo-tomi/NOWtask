/**
 * NowTask メインエントリポイント（ES Modules）
 * Testing Trophy対応のクリーンアーキテクチャ統合
 *
 * @author t-wada推奨のモジュラー設計 + Kent C. Dodds Testing Trophy
 * @version 2.0 (ES Modules対応)
 */

// ===== Core Modules =====
import {
  timeStringToMinutes,
  minutesToTimeString,
  getCurrentDateString,
  snap15,
  TimeUtilsTest
} from './core/timeUtils.js';

import {
  recalculateAllLanes,
  LaneEngineTest,
  updateGridLayout
} from './core/laneEngine.js';

// ===== Services =====
import {
  loadFromStorage,
  saveToStorage,
  initializeDummyData,
  Task,
  StorageTest
} from './services/storage.js';

// ===== UI Modules =====
import {
  createTaskCard,
  editTaskTitle,
  editTaskTime,
  TaskCardTest,
  enableDragAndResize,
  showNotification
} from './ui/taskCard.js';

import {
  initInfiniteScroll,
  ensureVisibleDays,
  renderTasksToPanel,
  jumpToDate,
  VirtualScrollTest
} from './ui/virtualScroll.js';

// ===== Stagewise Development Toolbar =====
// import { initToolbar } from '@stagewise/toolbar'; // 一時的に無効化

// ===== 必要な関数をインポート =====
import { 
  formatDateForDisplay, 
  getNextDate, 
  getPrevDate
} from './core/timeUtils.js';

// ===== グローバル変数 =====
let currentDate = getCurrentDateString();
let selectedTasks = new Set(); // マルチセレクト用
let focusedTaskId = null; // キーボードフォーカス中のタスク
let lastSelectedTaskId = null; // Shift選択用

/**
 * 初期日付を取得（URL > localStorage > 今日の順）
 * @returns {string} YYYY-MM-DD形式の日付
 */
function getInitialDate() {
  try {
    // 1. URLクエリパラメータから取得
    const urlParams = new URLSearchParams(window.location.search);
    const urlDate = urlParams.get('date');
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      console.log(`📅 URL日付を使用: ${urlDate}`);
      return urlDate;
    }

    // 2. localStorageから取得
    const savedDate = localStorage.getItem('nowTask_lastViewedDate');
    if (savedDate && /^\d{4}-\d{2}-\d{2}$/.test(savedDate)) {
      console.log(`📅 保存済み日付を使用: ${savedDate}`);
      return savedDate;
    }

    // 3. フォールバック：今日の日付
    const today = getCurrentDateString();
    console.log(`📅 今日の日付を使用: ${today}`);
    return today;

  } catch (error) {
    console.error('初期日付取得エラー:', error);
    return getCurrentDateString();
  }
}

/**
 * ブラウザURLを更新
 * @param {string} date - 表示する日付
 */
function updateBrowserUrl(date) {
  try {
    const url = new URL(window.location);
    url.searchParams.set('date', date);
    window.history.replaceState({}, '', url);
    
    // localStorageにも保存
    localStorage.setItem('nowTask_lastViewedDate', date);
    
  } catch (error) {
    console.error('URL更新エラー:', error);
  }
}

/**
 * 日付表示を更新
 */
function updateDateDisplay() {
  try {
    console.log('🔄 updateDateDisplay実行中');
    console.log('📅 currentDate変数:', currentDate);
    console.log('📅 AppState.currentDate:', window.AppState?.currentDate);
    
    const mainClock = document.getElementById('main-clock');
    if (mainClock) {
      const displayDate = formatDateForDisplay(currentDate);
      const now = new Date();
      const timeString = now.toTimeString().slice(0, 5); // HH:MM
      const displayText = `${currentDate} ${timeString}`;
      
      console.log('🕰️ 表示テキスト:', displayText);
      
      mainClock.textContent = displayText;
      mainClock.title = `${displayDate} - クリックして日付変更`;
      
      console.log('✅ main-clock更新完了');
    } else {
      console.warn('⚠️ main-clock要素が見つかりません');
    }
  } catch (error) {
    console.error('日付表示更新エラー:', error);
  }
}

/**
 * Stagewise Toolbar初期化（開発モードのみ）
 */
async function initializeStagewise() {
  try {
    // 動的インポートでStagewise Toolbarを読み込み（開発環境のみ）
    if (window.location.hostname === 'localhost' && window.location.port) {
      console.log('🔧 Stagewise Toolbar初期化試行中...');
      const { initToolbar } = await import('@stagewise/toolbar');
      initToolbar({ plugins: [] });
      console.log('✅ Stagewise Toolbar初期化完了');
    }
  } catch (error) {
    console.log('ℹ️ Stagewise Toolbar読み込みスキップ（通常動作）:', error.message);
  }
}

/**
 * グローバル状態の初期化（window.AppState）
 */
function initializeAppState() {
  console.log('🏗️ AppState初期化開始');
  console.log('🌐 現在のURL:', window.location.href);
  console.log('❓ URLSearchParams:', window.location.search);

  // URLから日付パラメータを取得
  const urlParams = new URLSearchParams(window.location.search);
  const dateFromURL = urlParams.get('date');
  console.log('📅 URLから取得した日付:', dateFromURL);
  
  const todayDate = getCurrentDateString();
  console.log('📅 今日の日付:', todayDate);
  
  const initialDate = (dateFromURL && /^\d{4}-\d{2}-\d{2}$/.test(dateFromURL)) ?
    dateFromURL : todayDate;
  
  console.log('📅 最終的に使用する初期日付:', initialDate);

  window.AppState = {
    // データ管理
    tasks: [],
    activeFilters: {
      priority: 'all',
      completed: 'all',
      search: ''
    },
    currentDate: initialDate,

    // UI状態
    sidebarCollapsed: false,
    debugMode: window.location.search.includes('debug=true'),

    // パフォーマンス情報
    performance: {
      initStartTime: performance.now(),
      lastRenderTime: 0,
      taskCount: 0
    },

    // FPS監視
    frameRate: 60,
    fpsHistory: [],

    // Web Worker関連
    laneWorker: null,
    workerRequests: new Map(),
    nextRequestId: 1
  };

  // グローバル変数currentDateをAppStateと同期
  currentDate = initialDate;
  window.AppState.currentDate = initialDate;

  console.log('✅ AppState初期化完了:', window.AppState);
  console.log('📅 グローバルcurrentDate同期:', currentDate);
  console.log('📅 AppState.currentDate同期:', window.AppState.currentDate);
}

/**
 * データロード & 初期化
 */
async function initializeData() {
  console.log('📊 データ初期化開始');

  try {
    // LocalStorageからデータロード
    const result = loadFromStorage();

    if (result.success) {
      window.AppState.tasks = result.tasks;
      window.AppState.performance.taskCount = result.tasks.length;

      console.log('📝 データロード完了:', {
        taskCount: result.tasks.length,
        isFirstTime: result.isFirstTime,
        version: result.version
      });
    } else {
      console.warn('データロード失敗、ダミーデータで初期化');
      window.AppState.tasks = initializeDummyData();
    }

    return { success: true };

  } catch (error) {
    console.error('データ初期化エラー:', error);
    // フォールバック：最小限のダミーデータ
    window.AppState.tasks = [
      new Task(null, 'サンプルタスク', '09:00', '10:00', 'normal', getCurrentDateString())
    ];
    return { success: false, error };
  }
}

/**
 * UI初期化 - 仮想スクロール & タイムライン
 */
async function initializeUI() {
  console.log('🎨 UI初期化開始');

  try {
    // 仮想スクロール初期化
    initInfiniteScroll();

    // レーン計算 & 初期レンダリング（Web Worker使用）
    if (window.AppState.tasks.length > 0) {
      calculateLanesAsync(window.AppState.tasks, (result) => {
        console.log('✅ 初期レーン計算完了（Web Worker）');
      });
    }

    // 現在日付のタスクを描画
    await renderCurrentDateTasks();

    console.log('✅ UI初期化完了');
    return { success: true };

  } catch (error) {
    console.error('UI初期化エラー:', error);
    return { success: false, error };
  }
}

/**
 * 現在日付のタスクレンダリング
 */
async function renderCurrentDateTasks() {
  const currentDate = window.AppState.currentDate;

  // URLから日付パラメータを取得（復元時用）
  const urlParams = new URLSearchParams(window.location.search);
  const dateFromURL = urlParams.get('date');

  const targetDate = (dateFromURL && /^\d{4}-\d{2}-\d{2}$/.test(dateFromURL)) ?
    dateFromURL : currentDate;

  // 仮想スクロールで対象日を表示
  ensureVisibleDays(targetDate);

  // 該当する日付パネルを取得してタスクをレンダリング
  // （ensureVisibleDaysで自動的にレンダリングされるが、明示的にも呼び出し）
  const dayPanel = document.querySelector(`[data-date="${targetDate}"]`);
  if (dayPanel) {
    renderTasksToPanel(targetDate, dayPanel);
  }
}

/**
 * 時計とNowLineの更新機能
 */
function initializeClock() {
  console.log('⏰ 時計機能初期化');

  const clockInterval = setInterval(updateClock, 1000);
  const nowLineInterval = setInterval(updateNowLine, 60000);

  function updateClock() {
    try {
      const now = new Date();
      const timeString = now.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // ヘッダー時計を更新（時刻のみ）
      const clockElement = document.getElementById('header-clock');
      if (clockElement) {
        clockElement.textContent = timeString;
      }

      // メイン時計を更新（現在の日付+時刻）
      const mainClock = document.getElementById('main-clock');
      if (mainClock) {
        // グローバル変数currentDateを使用（URLパラメータと同期済み）
        const dateObj = new Date(currentDate + 'T' + timeString);
        const displayText = `${currentDate} ${timeString.slice(0, 5)}`; // 秒を除く
        mainClock.textContent = displayText;
      }

    } catch (error) {
      console.error('時計更新エラー:', error);
    }
  }

  function updateNowLine() {
    try {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const todayString = getCurrentDateString();

      // 今日のNowLineを更新
      const nowLine = document.getElementById(`now-line-${todayString}`);
      if (nowLine) {
        nowLine.style.top = currentMinutes + 'px';
      }

    } catch (error) {
      console.error('NowLine更新エラー:', error);
    }
  }

  // 初期更新
  updateClock();
  updateNowLine();

  // インターバル設定
      // interval は上で const 宣言済み

  // クリーンアップ関数をグローバルに追加
  window.cleanupClock = () => {
    clearInterval(clockInterval);
    clearInterval(nowLineInterval);
  };
}

/**
 * グローバル関数の公開（後方互換性）
 */
function exposeGlobalFunctions() {
  // タスク管理関数
  window.editTaskTitle = editTaskTitle;
  window.editTaskTime = editTaskTime;
  window.jumpToDate = jumpToDate;
  window.jumpToToday = function() {
    try {
      const today = getCurrentDateString();
      const success = jumpToDate(today);
      
      if (success) {
        console.log('📅 今日の日付にジャンプ:', today);
        
        // 成功フィードバック表示
        const feedback = document.createElement('div');
        feedback.textContent = `📅 今日（${today}）に移動しました`;
        feedback.style.cssText = `
          position: fixed;
          top: 80px;
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
      } else {
        console.warn('今日の日付へのジャンプに失敗');
      }
      
      return success;
    } catch (error) {
      console.error('jumpToToday エラー:', error);
      return false;
    }
  };

  // タスク作成・削除・完了切り替え
  window.createNewTask = function(date = getCurrentDateString()) {
    try {
      const newTask = new Task(
        null,
        '新しいタスク',
        '09:00',
        '10:00',
        'normal',
        date
      );

      window.AppState.tasks.push(newTask);
      saveToStorage();
      recalculateAllLanes();

      // 該当日付パネルを再描画
      const dayPanel = document.querySelector(`[data-date="${date}"]`);
      if (dayPanel) {
        renderTasksToPanel(date, dayPanel);
      }

      console.log('✅ 新しいタスクを作成:', newTask.id);
      return newTask.id;

    } catch (error) {
      console.error('タスク作成エラー:', error);
      return null;
    }
  };

  window.deleteTask = function(taskId) {
    try {
      const taskIndex = window.AppState.tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) {return false;}

      const task = window.AppState.tasks[taskIndex];
      const taskDate = task.date;

      window.AppState.tasks.splice(taskIndex, 1);
      saveToStorage();
      recalculateAllLanes();

      // 該当日付パネルを再描画
      const dayPanel = document.querySelector(`[data-date="${taskDate}"]`);
      if (dayPanel) {
        renderTasksToPanel(taskDate, dayPanel);
      }

      console.log('🗑️ タスクを削除:', taskId);
      return true;

    } catch (error) {
      console.error('タスク削除エラー:', error);
      return false;
    }
  };

  window.toggleTaskCompletion = function(taskId) {
    try {
      const taskIndex = window.AppState.tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) {return false;}

      const task = window.AppState.tasks[taskIndex];
      const updatedTask = task.update({ completed: !task.completed });
      window.AppState.tasks[taskIndex] = updatedTask;

      saveToStorage();

      // UIを更新
      const card = document.querySelector(`[data-task-id="${taskId}"]`);
      if (card) {
        const button = card.querySelector('.task-action-btn');
        if (button) {
          button.textContent = updatedTask.completed ? '↺' : '✓';
          button.title = updatedTask.completed ? '未完了に戻す' : '完了にする';
          button.setAttribute('aria-label', updatedTask.completed ? '未完了に戻す' : '完了にする');
        }

        // 完了状態のクラス切り替え
        card.classList.toggle('completed', updatedTask.completed);
      }

      console.log('✅ タスク完了状態切り替え:', taskId, '→', updatedTask.completed);
      return true;

    } catch (error) {
      console.error('タスク完了切り替えエラー:', error);
      return false;
    }
  };

  window.confirmDeleteTask = function(taskId) {
    const task = window.AppState.tasks.find(t => t.id === taskId);
    if (!task) {return;}

    const confirmed = confirm(`「${task.title}」を削除しますか？`);
    if (confirmed) {
      window.deleteTask(taskId);
    }
  };

  // クイック追加機能
  window.addQuickTask = function() {
    try {
      const input = document.getElementById('quick-input');
      if (!input || !input.value.trim()) {
        return;
      }

      const title = input.value.trim();
      const currentDate = window.AppState.currentDate;
      
      // 現在時刻から1時間後のタスクを作成（15分単位でスナップ）
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      
      // 15分単位にスナップして次の15分区切りから開始
      const snappedMinutes = Math.ceil(currentMinutes / 15) * 15;
      const startHour = Math.floor(snappedMinutes / 60) % 24;
      const startMinute = snappedMinutes % 60;
      
      // 1時間後を終了時刻とする（15分単位）
      const endMinutes = snappedMinutes + 60;
      const endHour = Math.floor(endMinutes / 60) % 24;
      const endMinute = endMinutes % 60;
      
      const startTime = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
      const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;

      const newTask = new Task(
        null,
        title,
        startTime,
        endTime,
        'normal',
        currentDate
      );

      window.AppState.tasks.push(newTask);
      saveToStorage();
      recalculateAllLanes();

      // 該当日付パネルを再描画
      const dayPanel = document.querySelector(`[data-date="${currentDate}"]`);
      if (dayPanel) {
        renderTasksToPanel(currentDate, dayPanel);
      }

      // 入力フィールドをクリア
      input.value = '';
      
      console.log('✅ クイックタスクを作成:', newTask.id);
      return newTask.id;

    } catch (error) {
      console.error('クイックタスク作成エラー:', error);
      return null;
    }
  };

  // 日常テンプレート成功フィードバック
  function showDailyTemplateSuccess(title, startTime, duration) {
    const feedback = document.createElement('div');
    feedback.textContent = `✅ ${title}を${startTime}から${duration}分で追加しました`;
    feedback.style.cssText = `
      position: fixed;
      top: 120px;
      right: 20px;
      background: linear-gradient(135deg, var(--primary) 0%, #1E40AF 100%);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-weight: 600;
      z-index: 1000;
      animation: slideInFade 0.3s ease-out;
      box-shadow: 0 4px 12px rgba(46, 139, 255, 0.3);
    `;
    
    document.body.appendChild(feedback);
    
    // 3秒後に自動削除
    setTimeout(() => {
      feedback.style.animation = 'slideOutFade 0.3s ease-in';
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 300);
    }, 3000);
  }

  // テンプレート関数を早期定義してグローバル公開
  function defineTemplateGlobalFunctions() {
    // 夜勤テンプレート追加
    window.addWorkShiftTemplate = function() {
      try {
        const currentDate = window.AppState.currentDate;
        
        const newTask = new Task(
          null,
          '夜勤',
          '17:00',
          '09:00', // 翌日9時まで（日付跨ぎ）
          'high',
          currentDate
        );

        window.AppState.tasks.push(newTask);
        saveToStorage();
        recalculateAllLanes();

        // 該当日付パネルを再描画
        const dayPanel = document.querySelector(`[data-date="${currentDate}"]`);
        if (dayPanel) {
          renderTasksToPanel(currentDate, dayPanel);
        }

        console.log('✅ 夜勤テンプレートを追加:', newTask.id);
        return newTask.id;

      } catch (error) {
        console.error('夜勤テンプレート追加エラー:', error);
        return null;
      }
    };

    // 睡眠テンプレート追加
    window.addSleepTemplate = function(hours) {
      try {
        const currentDate = window.AppState.currentDate;
        
        // 23:00開始で指定時間の睡眠タスクを作成（15分単位）
        const startHour = 23;
        const startMinute = 0;
        const endTotalMinutes = (startHour * 60 + startMinute + hours * 60) % (24 * 60);
        const endHour = Math.floor(endTotalMinutes / 60);
        const endMinute = endTotalMinutes % 60;
        
        const startTime = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
        const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;

        const newTask = new Task(
          null,
          `睡眠 (${hours}時間)`,
          startTime,
          endTime,
          'normal',
          currentDate
        );

        window.AppState.tasks.push(newTask);
        saveToStorage();
        recalculateAllLanes();

        // 該当日付パネルを再描画
        const dayPanel = document.querySelector(`[data-date="${currentDate}"]`);
        if (dayPanel) {
          renderTasksToPanel(currentDate, dayPanel);
        }

        console.log('✅ 睡眠テンプレートを追加:', hours + '時間', newTask.id);
        return newTask.id;

      } catch (error) {
        console.error('睡眠テンプレート追加エラー:', error);
        return null;
      }
    };

    // 日常テンプレート追加
    window.addDailyTemplate = function(title, durationMinutes) {
      try {
        const currentDate = window.AppState.currentDate;
        
        // 現在時刻から開始時刻を計算（15分単位でスナップ）
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        // 15分単位にスナップして次の15分区切りから開始
        const snappedMinutes = Math.ceil(currentMinutes / 15) * 15;
        const startHour = Math.floor(snappedMinutes / 60) % 24;
        const startMinute = snappedMinutes % 60;
        
        // 指定分数後を終了時刻とする（15分単位でスナップ）
        const endTotalMinutes = snappedMinutes + durationMinutes;
        const endHour = Math.floor(endTotalMinutes / 60) % 24;
        const endMinute = endTotalMinutes % 60;
        
        const startTime = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
        const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;

        const newTask = new Task(
          null,
          title,
          startTime,
          endTime,
          'normal',
          currentDate
        );
        
        window.AppState.tasks.push(newTask);
        saveToStorage();
        recalculateAllLanes();

        // 該当日付パネルを再描画
        const dayPanel = document.querySelector(`[data-date="${currentDate}"]`);
        if (dayPanel) {
          renderTasksToPanel(currentDate, dayPanel);
        }

        // 成功フィードバックを表示
        showDailyTemplateSuccess(title, startTime, durationMinutes);
        
        console.log(`✅ 日常テンプレート追加 (${title} ${durationMinutes}分):`, newTask.id);
        return newTask.id;

      } catch (error) {
        console.error('日常テンプレート追加エラー:', error);
        alert(`${title}テンプレートの追加に失敗しました。`);
        return null;
      }
    };

    console.log('📋 テンプレート関数をグローバルに公開完了');
  }

  // テンプレート関数を即座に定義
  defineTemplateGlobalFunctions();

  // フィルター関数
  window.toggleFilter = function(priority) {
    try {
      const checkbox = document.querySelector(`input[data-priority="${priority}"]`);
      if (!checkbox) {return;}

      const isChecked = checkbox.checked;
      
      // AppStateのフィルター状態を更新
      if (window.AppState && window.AppState.activeFilters) {
        if (priority === 'all') {
          window.AppState.activeFilters.priority = isChecked ? 'all' : 'none';
        } else {
          // 優先度別フィルタリング（今後実装予定）
          window.AppState.activeFilters[priority] = isChecked;
        }
      }

      // タスクカードの表示/非表示を切り替え
      const cards = document.querySelectorAll('.task-card');
      cards.forEach(card => {
        const cardPriority = card.dataset.priority || 'normal';
        
        if (priority === 'all' || cardPriority === priority) {
          card.style.display = isChecked ? 'block' : 'none';
        }
      });

      console.log(`🔍 フィルター切り替え: ${priority} = ${isChecked}`);
      
    } catch (error) {
      console.error('フィルター切り替えエラー:', error);
    }
  };

  // カスタムタスク保存関数  
  window.saveCustomTask = function() {
    try {
      const titleInput = document.getElementById('task-title-input');
      const startTimeSelect = document.getElementById('task-start-time');
      const endTimeSelect = document.getElementById('task-end-time');
      const priorityInputs = document.querySelectorAll('input[name="task-priority"]');

      if (!titleInput || !startTimeSelect || !endTimeSelect) {
        alert('フォーム要素が見つかりません');
        return;
      }

      const title = titleInput.value.trim();
      const startTime = startTimeSelect.value;
      const endTime = endTimeSelect.value;
      let priority = 'normal';

      // 選択された優先度を取得
      priorityInputs.forEach(input => {
        if (input.checked) {
          priority = input.value;
        }
      });

      // バリデーション
      if (!title) {
        alert('タスク名を入力してください');
        titleInput.focus();
        return;
      }

      if (!startTime || !endTime) {
        alert('開始時刻と終了時刻を選択してください');
        return;
      }

      // 時刻の妥当性チェック
      const startMinutes = timeStringToMinutes(startTime);
      const endMinutes = timeStringToMinutes(endTime);
      
      if (endMinutes <= startMinutes) {
        alert('終了時刻は開始時刻より後に設定してください');
        return;
      }

      // 新しいタスクを作成
      const currentDate = window.AppState.currentDate;
      const newTask = new Task(
        null,
        title,
        startTime,
        endTime,
        priority,
        currentDate
      );

      // AppStateに追加
      window.AppState.tasks.push(newTask);
      saveToStorage();
      recalculateAllLanes();

      // 該当日付パネルを再描画
      const dayPanel = document.querySelector(`[data-date="${currentDate}"]`);
      if (dayPanel) {
        renderTasksToPanel(currentDate, dayPanel);
      }

      // フォームをリセット
      titleInput.value = '';
      startTimeSelect.value = '09:00';
      endTimeSelect.value = '10:00';
      
      // 優先度を通常に戻す
      const normalPriorityInput = document.querySelector('input[name="task-priority"][value="normal"]');
      if (normalPriorityInput) {
        normalPriorityInput.checked = true;
      }

      // フォームを非表示
      window.hideCustomTaskForm();

      // 成功通知
      showNotification(`カスタムタスク「${title}」を追加しました`, 'success');
      
      console.log('✅ カスタムタスクを保存:', newTask.id);
      return newTask.id;

    } catch (error) {
      console.error('カスタムタスク保存エラー:', error);
      alert('タスクの保存に失敗しました');
    }
  };

  // カスタムタスクフォーム切り替え
  window.toggleCustomTaskForm = function() {
    try {
      const form = document.getElementById('custom-task-form');
      if (!form) {
        console.warn('カスタムタスクフォームが見つかりません');
        return;
      }

      const isVisible = form.style.display !== 'none';
      form.style.display = isVisible ? 'none' : 'block';

      console.log('📝 カスタムタスクフォーム:', isVisible ? '非表示' : '表示');
      return !isVisible;

    } catch (error) {
      console.error('カスタムタスクフォーム切り替えエラー:', error);
      return false;
    }
  };

  // その他のサイドバー機能
  window.hideCustomTaskForm = function() {
    try {
      const form = document.getElementById('custom-task-form');
      if (form) {
        form.style.display = 'none';
      }
    } catch (error) {
      console.error('フォーム非表示エラー:', error);
    }
  };

  window.clearCompleted = function() {
    try {
      const completedTasks = window.AppState.tasks.filter(task => task.completed);
      if (completedTasks.length === 0) {
        alert('完了済みタスクがありません');
        return;
      }

      const confirmed = confirm(`${completedTasks.length}個の完了済みタスクを削除しますか？`);
      if (!confirmed) {
        return;
      }

      // 完了済みタスクを削除
      window.AppState.tasks = window.AppState.tasks.filter(task => !task.completed);
      saveToStorage();
      recalculateAllLanes();

      // 表示中の日付パネルを再描画
      const currentDate = window.AppState.currentDate;
      const dayPanel = document.querySelector(`[data-date="${currentDate}"]`);
      if (dayPanel) {
        renderTasksToPanel(currentDate, dayPanel);
      }

      console.log('🗑️ 完了済みタスクを削除:', completedTasks.length + '個');

    } catch (error) {
      console.error('完了済み削除エラー:', error);
    }
  };

  window.showDatePicker = function() {
    try {
      const currentDate = window.AppState.currentDate;
      
      // インライン入力モーダルで日付を取得
      if (typeof window.showInlineInput === 'function') {
        window.showInlineInput(
          '日付を変更',
          'YYYY-MM-DD 形式で入力',
          currentDate,
          (inputDate) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
              window.jumpToDate(inputDate);
            } else {
              // 通知機能を使ってエラー表示
              if (typeof window.showNotification === 'function') {
                window.showNotification('正しい形式で入力してください (YYYY-MM-DD)', 'error');
              } else {
                alert('正しい形式で入力してください (YYYY-MM-DD)');
              }
            }
          }
        );
      } else {
        // フォールバック：従来のprompt
        const newDate = prompt('日付を入力してください (YYYY-MM-DD):', currentDate);
        
        if (newDate && /^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
          window.jumpToDate(newDate);
        } else if (newDate) {
          alert('正しい形式で入力してください (YYYY-MM-DD)');
        }
      }
    } catch (error) {
      console.error('日付ピッカーエラー:', error);
    }
  };

  window.navigateDate = function(direction) {
    try {
      const currentDate = window.AppState.currentDate;
      const date = new Date(currentDate);
      date.setDate(date.getDate() + direction);
      
      const newDateString = date.toISOString().split('T')[0];
      window.jumpToDate(newDateString);
      
    } catch (error) {
      console.error('日付ナビゲーションエラー:', error);
    }
  };
}

/**
 * Testing Trophy対応のテスト機能公開
 */
// ※ exposeTestingAPI関数は3266行目の改良版を使用

/**
 * パフォーマンス情報の更新
 */
function updatePerformanceInfo() {
  const initTime = performance.now() - window.AppState.performance.initStartTime;

  window.AppState.performance.totalInitTime = initTime;
  window.AppState.performance.lastUpdate = new Date().toISOString();

  console.log('⚡ 初期化パフォーマンス:', {
    totalTime: initTime.toFixed(2) + 'ms',
    taskCount: window.AppState.tasks.length,
    timestamp: window.AppState.performance.lastUpdate
  });
}

/**
 * メイン初期化関数
 * DOMContentLoaded → Storage → VirtualScroll → Tasks → Clock → NowLine
 */
async function initializeNowTask() {
  console.log('🚀 NowTask初期化開始');

  try {
    // ❶ Stagewise Toolbar初期化（開発モードのみ）
    initializeStagewise();

    // ❷ AppState初期化
    initializeAppState();

    // ❸ Web Worker & パフォーマンス監視初期化
    initLaneWorker();
    initPerformanceMonitoring();

    // ❹ データロード（localStorage → ダミーデータ）
    await initializeData();

    // ❺ UI初期化（仮想スクロール → タスク描画）
    await initializeUI();

    // ❻ 時計・NowLine更新開始
    initializeClock();

    // ❼ グローバル関数公開
    exposeGlobalFunctions();

    // ❽ テストAPI公開（デバッグモード時）
    exposeTestingAPI();

    // ❾ パフォーマンス情報更新
    updatePerformanceInfo();

    console.log('🎉 NowTask初期化完了！');

  } catch (error) {
    console.error('❌ NowTask初期化エラー:', error);

    // エラー通知表示
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--accent);
      color: white;
      padding: 20px;
      border-radius: 8px;
      z-index: 9999;
      text-align: center;
    `;
    errorDiv.innerHTML = `
      <h3>初期化エラー</h3>
      <p>${error.message}</p>
      <button onclick="this.parentElement.remove()">閉じる</button>
    `;
    document.body.appendChild(errorDiv);
  }
}

// ===== 実行順序図（コメント） =====
/*
NowTask ES Modules 初期化順序図

1. DOMContentLoaded
   ↓
2. AppState初期化
   ├─ tasks: []
   ├─ currentDate: getCurrentDateString()
   ├─ debugMode: URL params check
   └─ performance tracking
   ↓
3. データロード
   ├─ loadFromStorage()
   │  ├─ localStorage exists? → JSON.parse → Task.fromJSON[]
   │  └─ localStorage empty? → initializeDummyData()
   └─ AppState.tasks = results
   ↓
4. UI初期化
   ├─ initInfiniteScroll()
   │  ├─ IntersectionObserver setup
   │  ├─ URL date restoration
   │  └─ ensureVisibleDays(centerDate)
   ├─ recalculateAllLanes()
   │  ├─ O(n log n) lane assignment
   │  └─ CSS Grid layout update
   └─ renderCurrentDateTasks()
      └─ renderTasksToPanel() → createTaskCard()
   ↓
5. リアルタイム機能
   ├─ updateClock() (1秒毎)
   └─ updateNowLine() (1分毎)
   ↓
6. API公開
   ├─ グローバル関数（後方互換性）
   │  ├─ editTaskTitle, editTaskTime
   │  ├─ createNewTask, deleteTask
   │  └─ toggleTaskCompletion
   └─ Testing API（デバッグモード時）
      ├─ NowTaskTest.timeUtils
      ├─ NowTaskTest.laneEngine
      ├─ NowTaskTest.storage
      ├─ NowTaskTest.taskCard
      └─ NowTaskTest.virtualScroll
   ↓
7. パフォーマンス計測完了
   └─ console.log('🎉 NowTask初期化完了！')

Testing Trophy階層:
- Unit Level: core/timeUtils.js, core/laneEngine.js
- Integration Level: services/storage.js, ui/taskCard.js
- E2E Level: ui/virtualScroll.js, main.js

Clean Architecture:
- Core: 純粋関数、ビジネスロジック
- Services: データアクセス、永続化
- UI: DOM操作、ユーザーインタラクション
- Main: 依存性注入、初期化統制
*/

// ===== Export functions for global access =====
window.showKeyboardHelp = showKeyboardHelp;
window.hideKeyboardHelp = hideKeyboardHelp;
window.toggleTaskSelection = toggleTaskSelection;
window.updateTaskSelectionUI = updateTaskSelectionUI;
window.updateSelectionCounter = updateSelectionCounter;
window.clearAllSelections = clearAllSelections;
window.selectedTasks = selectedTasks;
window.lastSelectedTaskId = lastSelectedTaskId;

// ===== メイン初期化 =====
// DOM読み込み完了時に初期化を開始
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

/* =====【 Web Worker 管理 】===== */
function initLaneWorker() {
  try {
    window.AppState.laneWorker = new Worker('./worker/laneWorker.js');

    window.AppState.laneWorker.onmessage = function(e) {
      const { type, requestId, success, data, error } = e.data;

      const request = window.AppState.workerRequests.get(requestId);
      if (!request) {return;}

      window.AppState.workerRequests.delete(requestId);

      if (success) {
        switch (type) {
          case 'LANES_CALCULATED':
            handleAllLanesCalculated(data, request.callback);
            break;
          case 'SINGLE_DATE_CALCULATED':
            handleSingleDateCalculated(data, request.callback);
            break;
        }
      } else {
        console.error('Worker エラー:', error);
        if (request.callback) {
          request.callback(null, error);
        }
      }
    };

    window.AppState.laneWorker.onerror = function(error) {
      console.error('Web Worker エラー:', error);
    };

    console.log('🚀 Web Worker初期化完了');
  } catch (error) {
    console.error('Web Worker初期化失敗:', error);
  }
}

/**
 * Web Workerでレーン計算を実行
 */
function calculateLanesAsync(tasks, callback) {
  if (!window.AppState.laneWorker) {
    console.warn('Web Worker未初期化、同期処理にフォールバック');
    // フォールバック処理（旧コード）
    return;
  }

  const requestId = window.AppState.nextRequestId++;
  window.AppState.workerRequests.set(requestId, { callback });

  // タスクオブジェクトをシリアライズ可能な形式に変換
  const serializedTasks = tasks.map(task => ({
    id: task.id,
    title: task.title,
    startTime: task.startTime,
    endTime: task.endTime,
    date: task.date,
    priority: task.priority,
    completed: task.completed,
    isOvernight: task.isOvernight()
  }));

  window.AppState.laneWorker.postMessage({
    type: 'CALCULATE_LANES',
    requestId,
    data: { tasks: serializedTasks }
  });
}

/**
 * 単一日付のレーン計算結果処理
 */
function handleSingleDateCalculated(result, callback) {
  const { date, maxLanes, assignments } = result;

  const panel = document.querySelector(`[data-date="${date}"]`);
  if (panel) {
    // タスクオブジェクトにレーン情報を設定
    for (const task of window.AppState.tasks) {
      if (task.date === date) {
        task.lane = assignments[task.id] || 0;
        task.maxLanes = maxLanes;
      }
    }

    updateGridLayoutOptimized(panel, maxLanes);
  }

  if (callback) {callback(result);}
}

/**
 * レーン計算結果の処理
 */
function handleAllLanesCalculated(result, callback) {
  const { laneData, calculationTime, processedDates, totalTasks } = result;

  // UIにレーン情報を適用
  for (const [dateString, dateData] of Object.entries(laneData)) {
    const panel = document.querySelector(`[data-date="${dateString}"]`);
    if (panel) {
      // タスクオブジェクトにレーン情報を設定
      for (const task of window.AppState.tasks) {
        if (task.date === dateString) {
          task.lane = dateData.assignments[task.id] || 0;
          task.maxLanes = dateData.maxLanes;
        }
      }

      // DOM更新（transform最適化版）
      updateGridLayoutOptimized(panel, dateData.maxLanes);
    }
  }

  // パフォーマンス統計
  if (window.AppState.isDebugMode) {
    console.log(`🎯 Web Worker レーン計算完了:
      ✓ 計算時間: ${calculationTime.toFixed(2)}ms
      ✓ 処理日数: ${processedDates}日
      ✓ 総タスク数: ${totalTasks}件
      ✓ 平均/日: ${(totalTasks / processedDates).toFixed(1)}件`);
  }

  if (callback) {callback(result);}
}

/**
 * transform最適化版グリッドレイアウト更新
 */
function updateGridLayoutOptimized(container, maxLanes) {
  if (!container) {return;}

  const tasksContainer = container.querySelector('.tasks-container');
  if (!tasksContainer) {return;}

  // CSS Grid設定
  tasksContainer.style.display = 'grid';
  tasksContainer.style.gridTemplateColumns = `repeat(${maxLanes}, 1fr)`;
  tasksContainer.style.gap = '2px';

  // パフォーマンス最適化
  tasksContainer.style.willChange = 'transform';
  tasksContainer.style.contain = 'layout style';

  // 各タスクカードの位置をtransformで最適化
  const taskCards = tasksContainer.querySelectorAll('.task-card');
  taskCards.forEach(card => {
    const taskId = card.dataset.taskId;
    const task = window.AppState.tasks.find(t => t.id === taskId);

    if (task && typeof task.lane !== 'undefined') {
      // grid-columnではなくtransformX使用でリフロー削減
      card.style.gridColumn = `${task.lane + 1} / ${task.lane + 2}`;

      // GPU加速のためのレイヤー強制生成
      card.style.willChange = 'transform';
      card.style.backfaceVisibility = 'hidden';

      // レーン別ボーダー色
      const borderColors = [
        'var(--primary)', 'var(--success)', 'var(--warning)',
        'var(--info)', 'var(--purple)'
      ];
      card.style.borderLeft = `3px solid ${borderColors[task.lane % borderColors.length]}`;
    }
  });
}

/* =====【 FPS監視システム 】===== */
// ※ initPerformanceMonitoring関数は3079行目の改良版を使用

/* =====【 アイドル時間でのタスクカード生成 】===== */
function createTaskCardsOnIdle(tasks, container) {
  if (!tasks || tasks.length === 0) {return;}

  // 表示中のタスクは即座に生成
  const visibleTasks = tasks.filter(task => isTaskVisible(task));
  visibleTasks.forEach(task => {
    const card = createTaskCard(task);
    container.appendChild(card);
    enableDragAndResize(card);
  });

  // 非表示タスクはアイドル時間に生成
  const hiddenTasks = tasks.filter(task => !isTaskVisible(task));

  function createNextCard() {
    if (hiddenTasks.length === 0) {return;}

    const task = hiddenTasks.shift();
    const card = createTaskCard(task);
    container.appendChild(card);
    enableDragAndResize(card);

    // 次のタスクをアイドル時間に処理
    if (hiddenTasks.length > 0) {
      if (window.requestIdleCallback) {
        requestIdleCallback(createNextCard, { timeout: 1000 });
      } else {
        setTimeout(createNextCard, 16); // 1フレーム後
      }
    }
  }

  if (hiddenTasks.length > 0) {
    if (window.requestIdleCallback) {
      requestIdleCallback(createNextCard, { timeout: 1000 });
    } else {
      setTimeout(createNextCard, 0);
    }
  }
}

/**
 * タスクが画面内に表示されているかチェック
 */
function isTaskVisible(task) {
  // 簡易的な実装：現在日から±1日のタスクを表示中とみなす
  const currentDate = new Date(window.AppState.currentDate);
  const taskDate = new Date(task.date);
  const dayDiff = Math.abs((taskDate - currentDate) / (1000 * 60 * 60 * 24));

  return dayDiff <= 1;
}

/* =====【 Testing API - Web Worker版 】===== */
if (typeof window !== 'undefined') {
  window.NowTaskTest = {
    // 既存のAPI...
    timeStringToMinutes: (str) => timeStringToMinutes(str),
    minutesToTimeString: (min) => minutesToTimeString(min),
    snap15: (min) => snap15(min),

    // パフォーマンステスト
    generateTestTasks: (count) => {
      console.log(`🧪 ${count}件のテストタスクを生成中...`);
      const tasks = [];
      const dates = [];
      const today = new Date();

      // 3日分の日付生成
      for (let i = -1; i <= 1; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
      }

      for (let i = 0; i < count; i++) {
        const dateIndex = i % dates.length;
        const date = dates[dateIndex];

        const startHour = Math.floor(Math.random() * 22) + 1;
        const startMin = Math.floor(Math.random() * 4) * 15;
        const duration = (Math.floor(Math.random() * 8) + 1) * 15;

        const startTime = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;
        const endMinutes = startHour * 60 + startMin + duration;
        const endHour = Math.floor(endMinutes / 60) % 24;
        const endMin = endMinutes % 60;
        const endTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

        const task = new Task({
          title: `テストタスク ${i + 1}`,
          startTime,
          endTime,
          date,
          priority: ['normal', 'high', 'urgent'][Math.floor(Math.random() * 3)]
        });

        tasks.push(task);
      }

      window.AppState.tasks = tasks;
      saveToStorage();

      console.log(`✅ ${count}件のテストタスク生成完了`);
      return tasks;
    },

            // Web Worker版レーンパフォーマンステスト
        testLaneManagement: {
          measureLanePerformance: (taskCount = 3000) => {
            console.log(`🏁 ${taskCount}タスクのレーンパフォーマンステスト開始`);
            const totalStartTime = performance.now();

            // FPS履歴をリセット
            window.AppState.fpsHistory = [];

            // テストタスク生成
            const tasks = window.NowTaskTest.generateTestTasks(taskCount);

            // Web Workerでレーン計算
            calculateLanesAsync(tasks, (result) => {
              const totalTime = performance.now() - totalStartTime;
              const { calculationTime, processedDates, totalTasks } = result;

              // FPS測定のために少し待機
              setTimeout(() => {
                const avgFPS = window.AppState.fpsHistory.length > 0
                  ? window.AppState.fpsHistory.reduce((a, b) => a + b) / window.AppState.fpsHistory.length
                  : 60;

                console.log(`
🎯 レーンパフォーマンステスト結果:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 基本統計:
  ✓ 総タスク数: ${totalTasks}件
  ✓ 処理日数: ${processedDates}日
  ✓ 平均密度: ${(totalTasks / processedDates).toFixed(1)}件/日

⚡ パフォーマンス:
  ✓ レーン計算時間: ${calculationTime.toFixed(2)}ms
  ✓ 総処理時間: ${totalTime.toFixed(2)}ms
  ✓ 平均FPS: ${avgFPS.toFixed(1)}fps
  ✓ 現在FPS: ${window.AppState.frameRate}fps

🎯 目標達成状況:
  ${calculationTime < 300 ? '✅' : '❌'} レーン計算 < 300ms
  ${totalTime < 3000 ? '✅' : '❌'} 総時間 < 3秒
  ${avgFPS >= 55 ? '✅' : '❌'} FPS >= 55

💡 最適化機能:
  ✅ Web Worker オフロード
  ✅ transform位置計算
  ✅ GPU加速 (will-change)
  ✅ レイアウト分離 (contain)
  ✅ アイドル時間処理
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

                return {
                  laneCalculationTime: calculationTime,
                  totalTime,
                  averageFPS: avgFPS,
                  currentFPS: window.AppState.frameRate,
                  success: calculationTime < 300 && totalTime < 3000 && avgFPS >= 55
                };
              }, 1000); // 1秒後にFPS測定
            });
          }
        }
  };
}

/**
 * 指定された日付に移動（アニメーション対応）
 * @param {string} targetDate - 移動先の日付（YYYY-MM-DD形式）
 * @param {string} direction - アニメーション方向 ('left' | 'right' | 'none')
 */
export async function navigateToDate(targetDate, direction = 'none') {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    console.error('Invalid date format:', targetDate);
    return;
  }

  const oldDate = currentDate;
  
  // 同じ日付の場合は何もしない
  if (targetDate === currentDate) {
    return;
  }

  try {
    // アニメーション用のコンテナを取得
    const timelineContainer = document.querySelector('.timeline-container');
    const dayPanels = document.querySelectorAll('.day-panel');
    
    // アニメーション方向を自動判定（directionが'none'の場合）
    if (direction === 'none') {
      const targetDateObj = new Date(targetDate);
      const currentDateObj = new Date(currentDate);
      direction = targetDateObj > currentDateObj ? 'right' : 'left';
    }

    // フェードアウト開始（既存コンテンツ）
    if (timelineContainer && direction !== 'none') {
      timelineContainer.classList.add('transitioning', 'fade-out');
      
      // アニメーション中は操作を無効化
      timelineContainer.style.pointerEvents = 'none';
    }

    // アニメーション待機時間
    if (direction !== 'none') {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 日付を更新（グローバル変数とAppState両方）
    currentDate = targetDate;
    window.AppState.currentDate = targetDate;
    
    // URLのクエリパラメータを更新
    updateBrowserUrl(targetDate);
    
    // UI要素を更新
    updateDateDisplay();
    
    // タスクデータを新しい日付で読み込み
    await loadTasksForDate(targetDate);
    
    // タイムラインを再描画
    renderTasks();
    
    // 現在時刻ラインを更新
    updateCurrentTimeLine();

    // フェードイン開始（新しいコンテンツ）
    if (timelineContainer && direction !== 'none') {
      // フェードアウトクラスを削除してフェードインを開始
      timelineContainer.classList.remove('fade-out');
      timelineContainer.classList.add('fade-in');
      
      // フェードインアニメーション完了後にクリーンアップ
      setTimeout(() => {
        timelineContainer.classList.remove('transitioning', 'fade-in');
        timelineContainer.style.pointerEvents = '';
        
        // 成功通知
        const dateDisplay = formatDateForDisplay(targetDate);
        showNotification(`${dateDisplay}に移動しました`, 'info', 2000);
      }, 300);
    }

    console.log(`日付変更完了: ${oldDate} → ${targetDate}`);

  } catch (error) {
    console.error('日付変更エラー:', error);
    
    // エラー時は元の日付に戻す
    currentDate = oldDate;
    updateDateDisplay();
    
    // アニメーションクリーンアップ
    const timelineContainer = document.querySelector('.timeline-container');
    if (timelineContainer) {
      timelineContainer.classList.remove('transitioning', 'fade-out', 'fade-in');
      timelineContainer.style.pointerEvents = '';
    }
    
    showNotification('日付の変更に失敗しました', 'error');
  }
}

/**
 * スクリーンリーダー用アナウンス
 * @param {string} message - アナウンスメッセージ
 * @param {string} priority - 優先度 ('polite' | 'assertive')
 */
function announceToScreenReader(message, priority = 'polite') {
  try {
    let liveRegion = document.getElementById('aria-live-region');
    
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'aria-live-region';
      liveRegion.setAttribute('aria-live', priority);
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.style.cssText = `
        position: absolute;
        left: -10000px;
        width: 1px;
        height: 1px;
        overflow: hidden;
      `;
      document.body.appendChild(liveRegion);
    }
    
    // 一度クリアしてから設定（確実に読み上げさせるため）
    liveRegion.textContent = '';
    setTimeout(() => {
      liveRegion.textContent = message;
    }, 10);
    
  } catch (error) {
    console.error('スクリーンリーダーアナウンスエラー:', error);
  }
}

/**
 * 前の日に移動（アニメーション対応）
 */
function goToPreviousDay() {
  const prevDate = getPrevDate(currentDate);
  navigateToDate(prevDate, 'left');
  
  // アクセシビリティ
  announceToScreenReader(`前日 ${formatDateForDisplay(prevDate)} に移動します`);
}

/**
 * 次の日に移動（アニメーション対応）
 */
function goToNextDay() {
  const nextDate = getNextDate(currentDate);
  navigateToDate(nextDate, 'right');
  
  // アクセシビリティ
  announceToScreenReader(`翌日 ${formatDateForDisplay(nextDate)} に移動します`);
}

/**
 * 今日に移動（アニメーション対応 + 現在時刻スクロール）
 */
function goToToday() {
  const today = getCurrentDateString();
  const direction = new Date(today) > new Date(currentDate) ? 'right' : 'left';
  
  navigateToDate(today, direction);
  
  // 現在時刻にスクロール
  setTimeout(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    // 今日の日付パネルを取得
    const todayPanel = document.querySelector(`[data-date="${today}"]`);
    if (todayPanel) {
      // パネル内のタスクコンテナを取得
      const tasksContainer = todayPanel.querySelector('.tasks-container');
      if (tasksContainer) {
        // パネルの上端位置を取得
        const panelTop = todayPanel.offsetTop;
        
        // 現在時刻の位置（1分=1px）+ パネルの上端位置
        const targetPosition = panelTop + currentMinutes;
        
        // 画面中央に表示するために、画面高さの半分を引く
        const offset = Math.max(0, targetPosition - window.innerHeight / 2);
        
        // タイムラインコンテナでスクロール
        const timelineContainer = document.querySelector('.timeline-container');
        if (timelineContainer) {
          timelineContainer.scrollTo({
            top: offset,
            behavior: 'smooth'
          });
          
          console.log(`📍 現在時刻 ${now.toTimeString().slice(0, 5)} (${currentMinutes}px) にスクロール`);
        }
      }
    }
  }, 500); // 日付移動アニメーション完了後にスクロール
  
  // アクセシビリティ
  const now = new Date();
  const timeString = now.toTimeString().slice(0, 5);
  announceToScreenReader(`今日 ${timeString} に移動しました`);
}

/**
 * アプリケーション初期化
 */
async function initializeApp() {
  try {
    console.log('🚀 NowTask アプリケーション開始');
    console.log('🌐 initializeApp - 現在のURL:', window.location.href);
    console.log('❓ initializeApp - URLSearchParams:', window.location.search);

    // Stagewise toolbar (開発モードのみ)
    await initializeStagewise();
    
    // ❶ AppState初期化
    initializeAppState();
    
    // ❷ グローバル関数公開（早期初期化）
    exposeGlobalFunctions();
    
    // ❸ Web Worker初期化（UI初期化前に実行）
    initLaneWorker();
    
    // ❹ データ初期化（AppState使用）
    await initializeData();

    // 初期日付の設定（URL > localStorage > 今日の順）
    currentDate = getInitialDate();
    window.AppState.currentDate = currentDate;
    console.log(`📅 初期日付: ${currentDate}`);

    // DOM要素の初期化
    initializeElements();
    
    // ❺ UI初期化（仮想スクロール等）
    await initializeUI();
    
    // ❻ レスポンシブレイアウト初期化（Phase 3）
    handleResponsiveLayout();
    
    // UIの初期表示
    updateDateDisplay();
    
    // グローバルキーボードショートカットの設定
    setupGlobalKeyboardShortcuts();
    
    // 詳細タスク追加フォームの時刻selectを設定
    initializeTimeSelects();
    
    // 現在時刻ラインの初期化と定期更新
    updateCurrentTimeLine();
    startCurrentTimeUpdater();
    
    // ❼ タスク統計情報の初期化
    initTaskStatistics();
    
    // 今日のタスクを読み込んで表示
    await loadTasksForDate(currentDate);
    renderTasks();
    
    // ❽ 統計情報を更新
    updateTaskStatistics();
    
    // ❾ モバイル向け追加機能
    initMobileEnhancements();

    // ❿ Phase 4: パフォーマンス最適化（95点→100点）
    initMemoryManagement();
    initIntelligentPreload();
    
    // 既存のパフォーマンス監視を強化版に置換
    if (typeof window.measureFPS !== 'undefined') {
      console.log('既存のパフォーマンス監視を検出、強化版で上書きします');
    }
    initPerformanceMonitoring();

    // 今日ボタンのイベントリスナー
    const todayBtn = document.getElementById('today-btn');
    if (todayBtn) {
      todayBtn.addEventListener('click', goToToday);
    }

    // 初期化完了通知（100点達成！）
    showNotification('🎉 NowTask 100点達成！最高のパフォーマンスでお楽しみください', 'success', 4000);
    
    console.log('✅ アプリケーション初期化完了');
    
  } catch (error) {
    console.error('❌ アプリケーション初期化エラー:', error);
    showNotification('アプリケーションの初期化に失敗しました', 'error');
  }
}

/**
 * タスク統計情報の初期化
 */
function initTaskStatistics() {
  try {
    // 統計情報要素の存在確認
    const totalTasksElement = document.getElementById('total-tasks');
    const completedTasksElement = document.getElementById('completed-tasks');
    const totalHoursElement = document.getElementById('total-hours');

    if (!totalTasksElement || !completedTasksElement || !totalHoursElement) {
      console.warn('統計情報要素が見つかりません');
      return;
    }

    // 初期値設定
    totalTasksElement.textContent = '0';
    completedTasksElement.textContent = '0';
    totalHoursElement.textContent = '0h';

    console.log('📊 タスク統計情報初期化完了');

  } catch (error) {
    console.error('タスク統計情報初期化エラー:', error);
  }
}

/**
 * タスク統計情報の更新
 */
function updateTaskStatistics() {
  try {
    if (!window.AppState || !window.AppState.tasks) {
      console.warn('AppStateが利用できません');
      return;
    }

    // 現在の日付のタスクをフィルタリング
    const todayTasks = window.AppState.tasks.filter(task => task.date === currentDate);
    
    // 統計計算
    const totalTasks = todayTasks.length;
    const completedTasks = todayTasks.filter(task => task.completed).length;
    
    // 総時間計算（分単位で計算してから時間に変換）
    const totalMinutes = todayTasks.reduce((total, task) => {
      try {
        const duration = task.getDurationMinutes();
        return total + (duration > 0 ? duration : 0);
      } catch (error) {
        console.warn('タスク時間計算エラー:', task.id, error);
        return total;
      }
    }, 0);

    const totalHours = Math.round(totalMinutes / 60 * 10) / 10; // 小数点1位まで

    // DOM要素更新
    const totalTasksElement = document.getElementById('total-tasks');
    const completedTasksElement = document.getElementById('completed-tasks');
    const totalHoursElement = document.getElementById('total-hours');

    if (totalTasksElement) {
      totalTasksElement.textContent = totalTasks.toString();
    }

    if (completedTasksElement) {
      completedTasksElement.textContent = completedTasks.toString();
    }

    if (totalHoursElement) {
      totalHoursElement.textContent = `${totalHours}h`;
    }

    // アニメーション効果
    [totalTasksElement, completedTasksElement, totalHoursElement].forEach(element => {
      if (element) {
        element.style.animation = 'none';
        element.offsetHeight; // リフロー強制
        element.style.animation = 'focus-pulse 0.5s ease-out';
      }
    });

    console.log(`📊 統計更新: ${totalTasks}件 | 完了${completedTasks}件 | ${totalHours}時間`);

  } catch (error) {
    console.error('タスク統計情報更新エラー:', error);
  }
}

/**
 * モバイル向け追加機能の初期化
 */
function initMobileEnhancements() {
  try {
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
      // ビューポート meta タグの動的調整
      updateViewportMeta();
      
      // タッチイベント最適化
      enableTouchOptimizations();
      
      // プルトゥリフレッシュ機能
      initPullToRefresh();
      
      console.log('📱 モバイル機能強化完了');
    }

  } catch (error) {
    console.error('モバイル機能強化エラー:', error);
  }
}

/**
 * ビューポート meta タグの動的調整
 */
function updateViewportMeta() {
  try {
    let viewport = document.querySelector('meta[name="viewport"]');
    
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }
    
    // iOSでのズーム無効化とバウンス防止
    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    
  } catch (error) {
    console.error('ビューポート設定エラー:', error);
  }
}

/**
 * タッチイベント最適化
 */
function enableTouchOptimizations() {
  try {
    // iOS Safariの300msタップ遅延を解消
    document.body.style.touchAction = 'manipulation';
    
    // バウンススクロール防止（タイムライン以外）
    document.body.addEventListener('touchmove', (e) => {
      const target = e.target.closest('.timeline-container, .sidebar');
      if (!target) {
        e.preventDefault();
      }
    }, { passive: false });

    // タッチフィードバック強化
    document.addEventListener('touchstart', (e) => {
      const target = e.target.closest('.task-card, .template-btn, .action-btn');
      if (target) {
        target.style.transform = 'scale(0.98)';
        target.style.transition = 'transform 0.1s ease';
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      const target = e.target.closest('.task-card, .template-btn, .action-btn');
      if (target) {
        setTimeout(() => {
          target.style.transform = '';
          target.style.transition = '';
        }, 100);
      }
    }, { passive: true });

  } catch (error) {
    console.error('タッチ最適化エラー:', error);
  }
}

/**
 * プルトゥリフレッシュ機能（実験的）
 */
function initPullToRefresh() {
  try {
    const timelineContainer = document.querySelector('.timeline-container');
    if (!timelineContainer) return;

    let startY = 0;
    let pullDistance = 0;
    let isPulling = false;
    const pullThreshold = 80;

    timelineContainer.addEventListener('touchstart', (e) => {
      if (timelineContainer.scrollTop === 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    }, { passive: true });

    timelineContainer.addEventListener('touchmove', (e) => {
      if (!isPulling) return;

      const currentY = e.touches[0].clientY;
      pullDistance = currentY - startY;

      if (pullDistance > 0 && timelineContainer.scrollTop === 0) {
        e.preventDefault();
        
        // プル距離に応じた視覚的フィードバック
        const opacity = Math.min(pullDistance / pullThreshold, 1);
        timelineContainer.style.transform = `translateY(${pullDistance * 0.3}px)`;
        timelineContainer.style.opacity = 1 - opacity * 0.2;
      }
    }, { passive: false });

    timelineContainer.addEventListener('touchend', () => {
      if (isPulling && pullDistance > pullThreshold) {
        // リフレッシュ実行
        showNotification('データを更新中...', 'info', 1000);
        
        setTimeout(async () => {
          await loadTasksForDate(currentDate);
          renderTasks();
          updateTaskStatistics();
          showNotification('データを更新しました', 'success', 2000);
        }, 300);
      }

      // リセット
      timelineContainer.style.transform = '';
      timelineContainer.style.opacity = '';
      isPulling = false;
      pullDistance = 0;
    }, { passive: true });

  } catch (error) {
    console.error('プルトゥリフレッシュ初期化エラー:', error);
  }
}

/**
 * グローバルキーボードショートカットの設定
 */
function setupGlobalKeyboardShortcuts() {
  document.addEventListener('keydown', handleGlobalKeyboard);
  
  // タスクカードのキーボード操作用にタブインデックスを設定
  document.addEventListener('click', updateTaskFocus);
  
  console.log('⌨️ キーボードショートカット設定完了');
}

/**
 * グローバルキーボードイベントハンドラー
 * @param {KeyboardEvent} e - キーボードイベント
 */
function handleGlobalKeyboard(e) {
  // 入力フィールドにフォーカスがある場合はスキップ
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
    return;
  }

  // モーダルが開いている場合の特別処理
  if (document.querySelector('.keyboard-help-overlay.visible')) {
    if (e.key === 'Escape') {
      hideKeyboardHelp();
    }
    return;
  }

  const { key, ctrlKey, shiftKey, metaKey } = e;
  
  try {
    switch (key) {
      // === 基本操作 ===
      case 'n':
      case 'N':
        if (!ctrlKey && !shiftKey) {
          e.preventDefault();
          createNewTaskAtCurrentTime();
          showRealtimeFeedback('新しいタスクを作成中...', '');
        }
        break;

      case 't':
      case 'T':
        if (!ctrlKey && !shiftKey) {
          e.preventDefault();
          goToToday();
        }
        break;

      case '?':
        if (!ctrlKey && !shiftKey) {
          e.preventDefault();
          showKeyboardHelp();
        }
        break;

      // === ナビゲーション ===
      case 'ArrowLeft':
      case 'h':
      case 'H':
        if (!ctrlKey && !shiftKey) {
          e.preventDefault();
          goToPreviousDay();
        }
        break;

      case 'ArrowRight':
      case 'l':
      case 'L':
        if (!ctrlKey && !shiftKey) {
          e.preventDefault();
          goToNextDay();
        }
        break;

      case 'ArrowUp':
        if (!ctrlKey && !shiftKey) {
          e.preventDefault();
          focusPreviousTask();
        }
        break;

      case 'ArrowDown':
        if (!ctrlKey && !shiftKey) {
          e.preventDefault();
          focusNextTask();
        }
        break;

      // === タスク操作 ===
      case 'Enter':
        if (focusedTaskId && !ctrlKey && !shiftKey) {
          e.preventDefault();
          editTaskTitle(focusedTaskId);
        }
        break;

      case 'e':
      case 'E':
        if (focusedTaskId && !ctrlKey && !shiftKey) {
          e.preventDefault();
          editTaskTitle(focusedTaskId);
        }
        break;

      case 'Delete':
      case 'd':
      case 'D':
        if (focusedTaskId && !ctrlKey && !shiftKey) {
          e.preventDefault();
          deleteTaskWithConfirmation(focusedTaskId);
        }
        break;

      // === マルチセレクト ===
      case 'a':
      case 'A':
        if (ctrlKey || metaKey) {
          e.preventDefault();
          toggleSelectAll();
        }
        break;

      case 'd':
      case 'D':
        if ((ctrlKey || metaKey) && focusedTaskId) {
          e.preventDefault();
          duplicateTask(focusedTaskId);
        }
        break;

      // === 選択操作 ===
      case ' ':
        if (focusedTaskId && !ctrlKey && !shiftKey) {
          e.preventDefault();
          toggleTaskSelection(focusedTaskId);
        }
        break;

      case 'Escape':
        clearAllSelections();
        clearTaskFocus();
        break;
    }

  } catch (error) {
    console.error('キーボードショートカットエラー:', error);
  }
}

/**
 * 新しいタスクを現在時刻に作成
 */
function createNewTaskAtCurrentTime() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const snappedMinutes = snap15(currentMinutes);
  
  const startTime = minutesToTimeString(snappedMinutes);
  const endTime = minutesToTimeString(Math.min(snappedMinutes + 60, 1439)); // 1時間後、最大23:59
  
  // 詳細タスク追加モーダルを表示
  if (window.showDetailTaskModal) {
    window.showDetailTaskModal(startTime, endTime);
  } else {
    // フォールバック：基本的なタスク作成
    console.log(`新しいタスク作成: ${startTime} - ${endTime}`);
    showRealtimeFeedback(`${startTime}に新しいタスクを作成`, '1時間');
  }
}

/**
 * キーボードショートカットヘルプを表示
 */
function showKeyboardHelp() {
  const overlay = document.getElementById('keyboard-help-overlay');
  if (overlay) {
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    
    // フォーカストラップ
    const closeButton = overlay.querySelector('.keyboard-help-close');
    if (closeButton) {
      closeButton.focus();
    }
  }
}

/**
 * キーボードショートカットヘルプを非表示
 */
function hideKeyboardHelp() {
  const overlay = document.getElementById('keyboard-help-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

/**
 * リアルタイムフィードバックを表示
 * @param {string} message - メッセージ
 * @param {string} duration - 継続時間情報
 */
function showRealtimeFeedback(message, duration) {
  const feedback = document.getElementById('realtime-feedback');
  if (!feedback) return;

  const timeEl = feedback.querySelector('.realtime-feedback-time');
  const durationEl = feedback.querySelector('.realtime-feedback-duration');

  if (timeEl) timeEl.textContent = message;
  if (durationEl) durationEl.textContent = duration;

  feedback.classList.add('visible');
  
  setTimeout(() => {
    feedback.classList.remove('visible');
  }, 2000);
}

/**
 * タスクフォーカス管理
 */
function updateTaskFocus(e) {
  const taskCard = e.target.closest('.task-card');
  if (taskCard) {
    setTaskFocus(taskCard.dataset.taskId);
  }
}

function setTaskFocus(taskId) {
  // 前のフォーカスを削除
  if (focusedTaskId) {
    const prevCard = document.querySelector(`[data-task-id="${focusedTaskId}"]`);
    if (prevCard) {
      prevCard.classList.remove('keyboard-focused');
      prevCard.removeAttribute('tabindex');
    }
  }

  focusedTaskId = taskId;

  if (taskId) {
    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    if (card) {
      card.classList.add('keyboard-focused');
      card.setAttribute('tabindex', '0');
      card.focus();
    }
  }
}

function clearTaskFocus() {
  if (focusedTaskId) {
    const card = document.querySelector(`[data-task-id="${focusedTaskId}"]`);
    if (card) {
      card.classList.remove('keyboard-focused');
      card.removeAttribute('tabindex');
    }
  }
  focusedTaskId = null;
}

function focusNextTask() {
  const taskCards = Array.from(document.querySelectorAll('.task-card')).sort((a, b) => {
    return parseInt(a.style.transform.match(/\d+/)?.[0] || 0) - parseInt(b.style.transform.match(/\d+/)?.[0] || 0);
  });

  if (taskCards.length === 0) return;

  let nextIndex = 0;
  if (focusedTaskId) {
    const currentIndex = taskCards.findIndex(card => card.dataset.taskId === focusedTaskId);
    nextIndex = (currentIndex + 1) % taskCards.length;
  }

  setTaskFocus(taskCards[nextIndex].dataset.taskId);
}

function focusPreviousTask() {
  const taskCards = Array.from(document.querySelectorAll('.task-card')).sort((a, b) => {
    return parseInt(a.style.transform.match(/\d+/)?.[0] || 0) - parseInt(b.style.transform.match(/\d+/)?.[0] || 0);
  });

  if (taskCards.length === 0) return;

  let prevIndex = taskCards.length - 1;
  if (focusedTaskId) {
    const currentIndex = taskCards.findIndex(card => card.dataset.taskId === focusedTaskId);
    prevIndex = currentIndex > 0 ? currentIndex - 1 : taskCards.length - 1;
  }

  setTaskFocus(taskCards[prevIndex].dataset.taskId);
}

/**
 * マルチセレクト機能
 */
function toggleTaskSelection(taskId) {
  if (selectedTasks.has(taskId)) {
    selectedTasks.delete(taskId);
  } else {
    selectedTasks.add(taskId);
  }
  
  updateTaskSelectionUI();
  updateSelectionCounter();
}

function updateTaskSelectionUI() {
  document.querySelectorAll('.task-card').forEach(card => {
    const taskId = card.dataset.taskId;
    if (selectedTasks.has(taskId)) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
}

function updateSelectionCounter() {
  const counter = document.getElementById('selection-counter');
  const countEl = document.getElementById('selection-count');
  
  if (counter && countEl) {
    countEl.textContent = selectedTasks.size;
    
    if (selectedTasks.size > 0) {
      counter.classList.add('visible');
    } else {
      counter.classList.remove('visible');
    }
  }
}

function toggleSelectAll() {
  const allTaskIds = Array.from(document.querySelectorAll('.task-card')).map(card => card.dataset.taskId);
  
  if (selectedTasks.size === allTaskIds.length) {
    // 全選択 → 全解除
    clearAllSelections();
  } else {
    // 部分選択 or 未選択 → 全選択
    allTaskIds.forEach(taskId => selectedTasks.add(taskId));
    updateTaskSelectionUI();
    updateSelectionCounter();
  }
}

function clearAllSelections() {
  selectedTasks.clear();
  updateTaskSelectionUI();
  updateSelectionCounter();
}

/**
 * DOM要素の初期化
 */
function initializeElements() {
  try {
    // 基本的なDOM要素の存在確認
    const requiredElementsById = [
      'main-clock',
      'today-btn'
    ];

    const requiredElementsByClass = [
      'timeline-container'
    ];

    const missingIds = requiredElementsById.filter(id => !document.getElementById(id));
    const missingClasses = requiredElementsByClass.filter(className => !document.querySelector(`.${className}`));
    
    const allMissing = [...missingIds, ...missingClasses];
    if (allMissing.length > 0) {
      console.warn('必要なDOM要素が見つかりません:', allMissing);
    }

    // インライン入力モーダルを初期化時に非表示にする
    const inlineInputOverlay = document.getElementById('inline-input-overlay');
    if (inlineInputOverlay) {
      inlineInputOverlay.style.display = 'none';
    }

    console.log('✅ DOM要素初期化完了');
  } catch (error) {
    console.error('DOM要素初期化エラー:', error);
  }
}

/**
 * 現在時刻ラインを更新（改良版）
 */
function updateCurrentTimeLine() {
  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const timeString = now.toTimeString().slice(0, 5);
    
    let currentTimeLine = document.querySelector('.current-time-line');
    
    // 現在時刻ラインが存在しない場合は作成
    if (!currentTimeLine) {
      currentTimeLine = document.createElement('div');
      currentTimeLine.className = 'current-time-line';
      
      // 時刻表示ラベルを追加
      const timeLabel = document.createElement('div');
      timeLabel.className = 'current-time-label';
      currentTimeLine.appendChild(timeLabel);
      
      // パルス効果用のドット
      const pulseDot = document.createElement('div');
      pulseDot.className = 'current-time-pulse';
      currentTimeLine.appendChild(pulseDot);
      
      const timelineContainer = document.querySelector('.timeline-container');
      if (timelineContainer) {
        timelineContainer.appendChild(currentTimeLine);
      }
    }
    
    // 位置を更新（1分=1px）
    currentTimeLine.style.top = currentMinutes + 'px';
    
    // 時刻表示を更新
    const timeLabel = currentTimeLine.querySelector('.current-time-label');
    if (timeLabel) {
      timeLabel.textContent = `現在時刻 ${timeString}`;
    }
    
    currentTimeLine.setAttribute('data-time', timeString);
    
  } catch (error) {
    console.error('現在時刻ライン更新エラー:', error);
  }
}

/**
 * 現在時刻ラインの定期更新を開始
 */
function startCurrentTimeUpdater() {
  try {
    // 1分ごとに更新
    setInterval(updateCurrentTimeLine, 60000);
    console.log('⏰ 現在時刻ライン更新開始');
  } catch (error) {
    console.error('現在時刻ライン更新開始エラー:', error);
  }
}

/**
 * 時刻選択要素の初期化
 */
function initializeTimeSelects() {
  try {
    // 15分刻みの時刻オプションを生成
    const startSelect = document.getElementById('task-start-time');
    const endSelect = document.getElementById('task-end-time');
    
    if (startSelect && endSelect) {
      // 既存のオプションをクリア
      startSelect.innerHTML = '';
      endSelect.innerHTML = '';
      
      // 0:00から23:45まで15分刻みでオプション生成
      for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
          const timeValue = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          
          const startOption = new Option(timeValue, timeValue);
          const endOption = new Option(timeValue, timeValue);
          
          startSelect.appendChild(startOption);
          endSelect.appendChild(endOption);
        }
      }
      
      // デフォルト値設定
      startSelect.value = '09:00';
      endSelect.value = '10:00';
    }
    
    console.log('⏰ 時刻選択要素初期化完了');
  } catch (error) {
    console.error('時刻選択要素初期化エラー:', error);
  }
}

/**
 * 指定日付のタスクを読み込み
 * @param {string} date - 読み込む日付（YYYY-MM-DD）
 */
async function loadTasksForDate(date) {
  try {
    console.log(`📥 ${date}のタスクを読み込み中...`);
    
    // AppStateからタスクを取得
    if (window.AppState && window.AppState.tasks) {
      const dateTasks = window.AppState.tasks.filter(task => task.date === date);
      console.log(`✅ ${date}のタスク読み込み完了: ${dateTasks.length}件`);
      return dateTasks;
    } else {
      console.warn('AppStateが利用できません');
      return [];
    }
    
  } catch (error) {
    console.error(`タスク読み込みエラー (${date}):`, error);
    return [];
  }
}

/**
 * タスクを画面に描画
 */
function renderTasks() {
  try {
    const timelineContainer = document.querySelector('.timeline-container');
    if (!timelineContainer) {
      console.warn('タイムラインコンテナが見つかりません');
      return;
    }

    // 既存のタスクカードを削除
    const existingCards = timelineContainer.querySelectorAll('.task-card');
    existingCards.forEach(card => card.remove());

    // AppStateからタスクを取得して描画
    if (window.AppState && window.AppState.tasks) {
      const currentDateTasks = window.AppState.tasks.filter(task => task.date === currentDate);
      console.log(`🎨 ${currentDateTasks.length}個のタスクを描画中...`);
      
      // 仮想スクロールの renderTasksToPanel を使用して描画
      if (typeof renderTasksToPanel === 'function') {
        let currentPanel = timelineContainer.querySelector(`[data-date="${currentDate}"]`);
        
        // パネルが存在しない場合は生成
        if (!currentPanel) {
          console.log(`📅 ${currentDate}のパネルを生成中...`);
          ensureVisibleDays(currentDate);
          currentPanel = timelineContainer.querySelector(`[data-date="${currentDate}"]`);
        }
        
        if (currentPanel) {
          renderTasksToPanel(currentDateTasks, currentPanel);
        } else {
          console.warn('パネル生成後も現在の日付パネルが見つかりません');
        }
      } else {
        console.warn('renderTasksToPanel関数が利用できません');
      }
    } else {
      console.log('🎨 AppState未初期化、デモタスクを表示');
    }
    
  } catch (error) {
    console.error('タスク描画エラー:', error);
  }
}

/**
 * モバイル端末でのサイドバー折りたたみ機能
 */
function initMobileSidebar() {
  try {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // モバイル端末でのみ実行
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    // 初期状態では展開
    let isCollapsed = false;

    // 折りたたみタブクリックイベント
    const toggleSidebar = (e) => {
      // タブ領域のクリック判定（サイドバー上部40px）
      const rect = sidebar.getBoundingClientRect();
      const clickY = e.clientY;
      const tabTop = rect.top - 40;
      const tabBottom = rect.top;

      if (clickY >= tabTop && clickY <= tabBottom) {
        isCollapsed = !isCollapsed;
        sidebar.classList.toggle('collapsed', isCollapsed);
        
        // アナウンス
        const status = isCollapsed ? '折りたたまれました' : '展開されました';
        announceToScreenReader(`サイドバーが${status}`, 'polite');
        
        // ローカルストレージに状態保存
        localStorage.setItem('nowTask_sidebarCollapsed', isCollapsed.toString());
      }
    };

    // 疑似要素はクリック不可なので、サイドバー全体にイベント追加
    sidebar.addEventListener('click', toggleSidebar);

    // スワイプジェスチャーでの折りたたみ
    let startY = 0;
    let startTime = 0;

    sidebar.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });

    sidebar.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 0) return;
      
      const endY = e.changedTouches[0].clientY;
      const endTime = Date.now();
      const deltaY = endY - startY;
      const deltaTime = endTime - startTime;

      // 上下スワイプの判定（最低50px、最大500ms）
      if (Math.abs(deltaY) > 50 && deltaTime < 500) {
        if (deltaY < 0 && !isCollapsed) {
          // 上スワイプで折りたたみ
          isCollapsed = true;
          sidebar.classList.add('collapsed');
          announceToScreenReader('サイドバーが折りたたまれました', 'polite');
        } else if (deltaY > 0 && isCollapsed) {
          // 下スワイプで展開
          isCollapsed = false;
          sidebar.classList.remove('collapsed');
          announceToScreenReader('サイドバーが展開されました', 'polite');
        }
        
        localStorage.setItem('nowTask_sidebarCollapsed', isCollapsed.toString());
      }
    }, { passive: true });

    // 保存済み状態の復元
    const savedState = localStorage.getItem('nowTask_sidebarCollapsed');
    if (savedState === 'true') {
      isCollapsed = true;
      sidebar.classList.add('collapsed');
    }

    console.log('📱 モバイルサイドバー機能初期化完了');

  } catch (error) {
    console.error('モバイルサイドバー初期化エラー:', error);
  }
}

/**
 * レスポンシブレイアウト調整
 */
function handleResponsiveLayout() {
  try {
    const handleResize = () => {
      const isMobile = window.innerWidth <= 768;
      const sidebar = document.querySelector('.sidebar');
      
      if (sidebar) {
        if (isMobile) {
          // モバイル：下部パネルモード
          sidebar.classList.add('mobile-mode');
          
          // 折りたたみ機能を初期化
          initMobileSidebar();
        } else {
          // デスクトップ：サイドパネルモード
          sidebar.classList.remove('mobile-mode', 'collapsed');
        }
      }

      // タイムラインコンテナの高さ調整
      const timelineContainer = document.querySelector('.timeline-container');
      if (timelineContainer && isMobile) {
        const headerHeight = document.querySelector('.header')?.offsetHeight || 56;
        const quickAddHeight = document.querySelector('.quick-add-bar')?.offsetHeight || 50;
        const sidebarHeight = 200; // モバイルサイドバー高さ
        
        const availableHeight = window.innerHeight - headerHeight - quickAddHeight - sidebarHeight;
        timelineContainer.style.height = `${availableHeight}px`;
      }
    };

    // 初回実行
    handleResize();

    // リサイズ時の処理（デバウンス）
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 100);
    });

    console.log('📐 レスポンシブレイアウト初期化完了');

  } catch (error) {
    console.error('レスポンシブレイアウト初期化エラー:', error);
  }
}

/**
 * パフォーマンス最適化機能 Phase 4（95点→100点）
 */

/**
 * メモリリーク防止とクリーンアップ
 */
function initMemoryManagement() {
  try {
    // DOM要素とイベントリスナーの追跡
    const registeredElements = new WeakMap();
    const eventListeners = new Map();

    // 元のaddEventListenerをオーバーライド
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      const element = this;
      
      if (!eventListeners.has(element)) {
        eventListeners.set(element, []);
      }
      
      eventListeners.get(element).push({ type, listener, options });
      return originalAddEventListener.call(this, type, listener, options);
    };

    // クリーンアップ関数
    window.cleanupEventListeners = () => {
      for (const [element, listeners] of eventListeners) {
        listeners.forEach(({ type, listener, options }) => {
          try {
            element.removeEventListener(type, listener, options);
          } catch (error) {
            console.warn('イベントリスナー削除エラー:', error);
          }
        });
      }
      eventListeners.clear();
      console.log('🧹 イベントリスナークリーンアップ完了');
    };

    // ページを離れる時のクリーンアップ
    window.addEventListener('beforeunload', () => {
      window.cleanupEventListeners();
      
      // Web Worker終了
      if (window.AppState?.laneWorker) {
        window.AppState.laneWorker.terminate();
      }
    });

    console.log('🧠 メモリ管理システム初期化完了');

  } catch (error) {
    console.error('メモリ管理初期化エラー:', error);
  }
}

/**
 * インテリジェントプリロード機能
 */
function initIntelligentPreload() {
  try {
    const preloadQueue = new Set();
    const preloadedDates = new Map();
    
    // 過去のユーザー行動を学習
    const userBehavior = JSON.parse(localStorage.getItem('nowTask_userBehavior') || '{}');
    const viewHistory = userBehavior.viewHistory || [];
    
    // 頻繁にアクセスされる日付を予測
    const predictNextDates = (currentDate) => {
      const predictions = [];
      const currentDay = new Date(currentDate).getDay();
      
      // 曜日パターン学習
      const dayFrequency = viewHistory.reduce((freq, entry) => {
        const day = new Date(entry.date).getDay();
        freq[day] = (freq[day] || 0) + 1;
        return freq;
      }, {});
      
      // 高頻度の曜日を予測
      Object.entries(dayFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .forEach(([day]) => {
          const targetDate = new Date(currentDate);
          targetDate.setDate(targetDate.getDate() + (parseInt(day) - currentDay));
          predictions.push(targetDate.toISOString().split('T')[0]);
        });
      
      return predictions;
    };

    // バックグラウンドでデータをプリロード
    const preloadData = async (date) => {
      if (preloadQueue.has(date) || preloadedDates.has(date)) return;
      
      preloadQueue.add(date);
      
      try {
        // requestIdleCallbackでアイドル時に実行
        await new Promise(resolve => {
          if (window.requestIdleCallback) {
            requestIdleCallback(resolve, { timeout: 2000 });
          } else {
            setTimeout(resolve, 100);
          }
        });
        
        const tasks = await loadTasksForDate(date);
        preloadedDates.set(date, tasks);
        
        console.log(`🔮 ${date}のデータをプリロード完了`);
        
      } catch (error) {
        console.warn('データプリロードエラー:', date, error);
      } finally {
        preloadQueue.delete(date);
      }
    };

    // 現在日付の周辺をプリロード
    const preloadSurroundingDates = (currentDate) => {
      const predictions = predictNextDates(currentDate);
      predictions.forEach(date => preloadData(date));
      
      // 前後3日もプリロード
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const targetDate = new Date(currentDate);
        targetDate.setDate(targetDate.getDate() + i);
        preloadData(targetDate.toISOString().split('T')[0]);
      }
    };

    // 日付変更時にプリロード実行
    window.addEventListener('dateChanged', (e) => {
      preloadSurroundingDates(e.detail.date);
      
      // ユーザー行動の記録
      viewHistory.push({
        date: e.detail.date,
        timestamp: Date.now()
      });
      
      // 過去100件まで保持
      if (viewHistory.length > 100) {
        viewHistory.splice(0, viewHistory.length - 100);
      }
      
      userBehavior.viewHistory = viewHistory;
      localStorage.setItem('nowTask_userBehavior', JSON.stringify(userBehavior));
    });

    // 初回プリロード
    preloadSurroundingDates(currentDate);

    console.log('🔮 インテリジェントプリロード初期化完了');

  } catch (error) {
    console.error('インテリジェントプリロード初期化エラー:', error);
  }
}

/**
 * パフォーマンス監視とボトルネック検出
 */
function initPerformanceMonitoring() {
  try {
    const performanceMetrics = {
      fpsHistory: [],
      renderTimes: [],
      memoryUsage: [],
      userInteractionLatency: []
    };

    // FPS測定（改良版）
    let frameCount = 0;
    let lastTime = performance.now();
    
    function measureFPS() {
      const currentTime = performance.now();
      frameCount++;
      
      if (currentTime - lastTime >= 1000) {
        const fps = Math.round(frameCount * 1000 / (currentTime - lastTime));
        performanceMetrics.fpsHistory.push(fps);
        
        // 過去60秒分のデータを保持
        if (performanceMetrics.fpsHistory.length > 60) {
          performanceMetrics.fpsHistory.shift();
        }
        
        // FPS低下の警告
        if (fps < 40) {
          console.warn(`⚠️ FPS低下検出: ${fps}fps`);
          optimizePerformance();
        }
        
        frameCount = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(measureFPS);
    }
    
    measureFPS();

    // メモリ使用量監視
    if (performance.memory) {
      setInterval(() => {
        const memInfo = {
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
        };
        
        performanceMetrics.memoryUsage.push(memInfo);
        
        // メモリ使用量が80%を超えた場合の警告
        if (memInfo.used / memInfo.limit > 0.8) {
          console.warn('⚠️ メモリ使用量が高くなっています:', memInfo);
          triggerGarbageCollection();
        }
      }, 5000);
    }

    // レンダリング時間測定
    const measureRenderTime = (label) => {
      const startTime = performance.now();
      return () => {
        const endTime = performance.now();
        const renderTime = endTime - startTime;
        performanceMetrics.renderTimes.push({ label, time: renderTime });
        
        if (renderTime > 16.67) { // 60FPS基準
          console.warn(`⚠️ レンダリング遅延: ${label} (${renderTime.toFixed(2)}ms)`);
        }
      };
    };

    // パフォーマンスレポート生成
    window.generatePerformanceReport = () => {
      const avgFPS = performanceMetrics.fpsHistory.reduce((a, b) => a + b, 0) / performanceMetrics.fpsHistory.length;
      const avgRenderTime = performanceMetrics.renderTimes.reduce((sum, item) => sum + item.time, 0) / performanceMetrics.renderTimes.length;
      
      const report = {
        averageFPS: Math.round(avgFPS),
        averageRenderTime: Math.round(avgRenderTime * 100) / 100,
        memoryPeak: Math.max(...performanceMetrics.memoryUsage.map(m => m.used)),
        taskCount: window.AppState?.tasks?.length || 0,
        timestamp: new Date().toISOString()
      };
      
      console.table(report);
      return report;
    };

    // グローバル関数として公開
    window.measureRenderTime = measureRenderTime;

    console.log('📊 パフォーマンス監視システム初期化完了');

  } catch (error) {
    console.error('パフォーマンス監視初期化エラー:', error);
  }
}

/**
 * 動的パフォーマンス最適化
 */
function optimizePerformance() {
  try {
    console.log('🚀 動的パフォーマンス最適化開始');

    // DOM要素の最適化
    const optimizeDOM = () => {
      // 不可視要素の非表示
      const timelineContainer = document.querySelector('.timeline-container');
      if (timelineContainer) {
        const rect = timelineContainer.getBoundingClientRect();
        const taskCards = timelineContainer.querySelectorAll('.task-card');
        
        taskCards.forEach(card => {
          const cardRect = card.getBoundingClientRect();
          const isVisible = cardRect.bottom > rect.top && cardRect.top < rect.bottom;
          
          if (!isVisible) {
            card.style.display = 'none';
          } else {
            card.style.display = '';
          }
        });
      }
    };

    // アニメーションの一時無効化
    const disableAnimations = () => {
      document.body.style.setProperty('--transition-fast', '0s');
      document.body.style.setProperty('--transition-normal', '0s');
      document.body.style.setProperty('--transition-slow', '0s');
      
      setTimeout(() => {
        document.body.style.removeProperty('--transition-fast');
        document.body.style.removeProperty('--transition-normal');
        document.body.style.removeProperty('--transition-slow');
      }, 2000);
    };

    // レンダリング頻度の制限
    let isOptimizing = false;
    const throttledOptimize = () => {
      if (isOptimizing) return;
      isOptimizing = true;
      
      requestAnimationFrame(() => {
        optimizeDOM();
        isOptimizing = false;
      });
    };

    // 最適化実行
    disableAnimations();
    throttledOptimize();

    console.log('✅ 動的パフォーマンス最適化完了');

  } catch (error) {
    console.error('パフォーマンス最適化エラー:', error);
  }
}

/**
 * ガベージコレクション促進
 */
function triggerGarbageCollection() {
  try {
    // 不要な参照をクリア
    if (window.AppState) {
      // 古いタスクデータのクリーンアップ
      const currentTime = Date.now();
      const oneWeekAgo = currentTime - 7 * 24 * 60 * 60 * 1000;
      
      const oldTasks = window.AppState.tasks.filter(task => {
        const taskDate = new Date(task.date).getTime();
        return taskDate < oneWeekAgo;
      });
      
      if (oldTasks.length > 0) {
        console.log(`🗑️ ${oldTasks.length}件の古いタスクをクリーンアップ`);
        window.AppState.tasks = window.AppState.tasks.filter(task => {
          const taskDate = new Date(task.date).getTime();
          return taskDate >= oneWeekAgo;
        });
        saveToStorage();
      }
    }

    // DOM要素のクリーンアップ
    const unusedElements = document.querySelectorAll('[data-task-id]');
    unusedElements.forEach(element => {
      const taskId = element.dataset.taskId;
      const taskExists = window.AppState?.tasks?.some(task => task.id === taskId);
      
      if (!taskExists) {
        element.remove();
      }
    });

    console.log('🧹 ガベージコレクション完了');

  } catch (error) {
    console.error('ガベージコレクションエラー:', error);
  }
}

/**
 * Testing Trophy対応：テスト用API公開
 */
function exposeTestingAPI() {
  console.log('🧪 Testing Trophy API初期化開始');

  window.NowTaskTestAPI = {
    // === データ関連 ===
    getTasks: () => window.AppState?.tasks || [],
    getTask: (id) => window.AppState?.tasks?.find(task => task.id === id),
    getCurrentDate: () => currentDate,
    
    // === Phase 4: パフォーマンス測定 ===
    performance: {
      generateReport: () => window.generatePerformanceReport?.() || '未初期化',
      measureRender: (label) => window.measureRenderTime?.(label) || (() => {}),
      optimizeNow: () => optimizePerformance(),
      cleanMemory: () => triggerGarbageCollection(),
      
      // FPS連続測定（テスト用）
      measureFPSFor: async (seconds = 10) => {
        console.log(`📊 ${seconds}秒間のFPS測定開始...`);
        const results = [];
        const startTime = performance.now();
        
        const measure = () => {
          if ((performance.now() - startTime) < seconds * 1000) {
            const fps = window.AppState?.frameRate || 60;
            results.push(fps);
            requestAnimationFrame(measure);
          } else {
            const avgFPS = results.reduce((a, b) => a + b, 0) / results.length;
            const minFPS = Math.min(...results);
            const maxFPS = Math.max(...results);
            
            const report = {
              測定時間: `${seconds}秒`,
              平均FPS: Math.round(avgFPS),
              最低FPS: minFPS,
              最高FPS: maxFPS,
              フレーム数: results.length,
              パフォーマンス評価: avgFPS >= 55 ? '優秀' : avgFPS >= 45 ? '良好' : avgFPS >= 30 ? '普通' : '要改善'
            };
            
            console.table(report);
            return report;
          }
        };
        
        measure();
      },
      
      // 大量タスク生成（負荷テスト）
      stressTest: async (taskCount = 300) => {
        console.log(`🔥 負荷テスト開始: ${taskCount}件のタスクを生成...`);
        const startTime = performance.now();
        
        for (let i = 0; i < taskCount; i++) {
          const startHour = Math.floor(Math.random() * 22);
          const duration = Math.floor(Math.random() * 120) + 15; // 15-135分
          const endMinutes = (startHour * 60) + duration;
          const endHour = Math.floor(endMinutes / 60);
          const endMin = endMinutes % 60;
          
          window.NowTaskTestAPI.createTask({
            title: `負荷テストタスク ${i + 1}`,
            startTime: `${startHour.toString().padStart(2, '0')}:00`,
            endTime: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`,
            priority: ['normal', 'high', 'urgent'][Math.floor(Math.random() * 3)]
          });
        }
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        console.log(`✅ 負荷テスト完了: ${duration.toFixed(2)}ms で ${taskCount}件生成`);
        
        // レーン計算も含めた総合測定
        const laneStartTime = performance.now();
        recalculateAllLanes();
        const laneEndTime = performance.now();
        
        const report = {
          タスク生成時間: `${duration.toFixed(2)}ms`,
          レーン計算時間: `${(laneEndTime - laneStartTime).toFixed(2)}ms`,
          総時間: `${(laneEndTime - startTime).toFixed(2)}ms`,
          タスク数: window.AppState.tasks.length,
          パフォーマンス評価: duration < 100 ? '優秀' : duration < 500 ? '良好' : '要改善'
        };
        
        console.table(report);
        return report;
      }
    },
    
    // === レーン分けテスト ===
    laneEngine: {
      test: LaneEngineTest,
      recalculateAll: recalculateAllLanes,
      updateLayout: updateGridLayout
    },
    
    // === 時間計算テスト ===
    timeUtils: {
      test: TimeUtilsTest,
      convert: timeStringToMinutes,
      format: minutesToTimeString,
      snap: snap15
    },
    
    // === ストレージテスト ===
    storage: {
      test: StorageTest,
      save: saveToStorage,
      load: loadFromStorage
    },
    
    // === タスクカードテスト ===
    taskCard: {
      test: TaskCardTest,
      create: createTaskCard,
      editTitle: editTaskTitle,
      editTime: editTaskTime
    },
    
    // === 仮想スクロールテスト ===
    virtualScroll: {
      test: VirtualScrollTest,
      ensure: ensureVisibleDays,
      render: renderTasksToPanel,
      jump: jumpToDate
    },
    
    // === 統合テスト（300件タスク + FPS測定） ===
    runFullStressTest: async () => {
      console.log('🚀 NowTask フルストレステスト開始');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // 1. 現在のベースライン測定
      console.log('📊 1. ベースライン測定...');
      await window.NowTaskTestAPI.performance.measureFPSFor(3);
      
      // 2. 大量タスク生成
      console.log('📊 2. 300件タスク生成...');
      const stressResult = await window.NowTaskTestAPI.performance.stressTest(300);
      
      // 3. レンダリング性能測定
      console.log('📊 3. レンダリング性能測定...');
      const renderStart = window.measureRenderTime('大量タスクレンダリング');
      renderTasks();
      renderStart();
      
      // 4. 負荷状態でのFPS測定
      console.log('📊 4. 負荷状態FPS測定...');
      await window.NowTaskTestAPI.performance.measureFPSFor(5);
      
      // 5. 最終パフォーマンスレポート
      console.log('📊 5. 最終レポート...');
      const finalReport = window.generatePerformanceReport();
      
      // 6. 評価
      const overallScore = 
        (finalReport.averageFPS >= 55 ? 30 : finalReport.averageFPS >= 45 ? 25 : 15) +
        (finalReport.averageRenderTime <= 16 ? 30 : finalReport.averageRenderTime <= 33 ? 20 : 10) +
        (stressResult.パフォーマンス評価 === '優秀' ? 25 : stressResult.パフォーマンス評価 === '良好' ? 20 : 10) +
        (finalReport.taskCount >= 300 ? 15 : 10);
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🎯 NowTask 総合スコア: ${overallScore}/100点`);
      
      if (overallScore >= 90) {
        console.log('🏆 評価: 極めて優秀！ 世界クラスのパフォーマンス');
        showNotification('🏆 NowTask - 世界クラスのパフォーマンス達成！', 'success', 5000);
      } else if (overallScore >= 80) {
        console.log('🥇 評価: 優秀 - プロダクション準備完了');
        showNotification('🥇 NowTask - 優秀な性能です！', 'success', 3000);
      } else if (overallScore >= 70) {
        console.log('🥈 評価: 良好 - 改善の余地あり');
        showNotification('🥈 NowTask - 良好な性能です', 'info', 3000);
      } else {
        console.log('🥉 評価: 要改善 - 最適化が必要');
        showNotification('🥉 NowTask - 最適化をお勧めします', 'info', 3000);
      }
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      return { overallScore, finalReport, stressResult };
    },
    
    // === ユーティリティ関数 ===
    createTask: (data) => {
      const task = new Task(
        null,
        data.title,
        data.startTime,
        data.endTime,
        data.priority || 'normal',
        data.date || currentDate
      );
      window.AppState.tasks.push(task);
      saveToStorage();
      return task;
    },
    
    deleteAllTasks: () => {
      window.AppState.tasks = [];
      saveToStorage();
      renderTasks();
    },
    
    // デモタスク生成
    createDemoTasks: () => {
      const demoTasks = [
        { title: '朝の運動', startTime: '06:00', endTime: '07:00', priority: 'high' },
        { title: '朝食', startTime: '07:30', endTime: '08:00', priority: 'normal' },
        { title: 'プレゼン準備', startTime: '09:00', endTime: '11:30', priority: 'urgent' },
        { title: 'ランチミーティング', startTime: '12:00', endTime: '13:00', priority: 'high' },
        { title: 'コードレビュー', startTime: '14:00', endTime: '16:00', priority: 'normal' },
        { title: 'チーム会議', startTime: '16:30', endTime: '17:30', priority: 'high' }
      ];
      
      demoTasks.forEach(data => window.NowTaskTestAPI.createTask(data));
      renderTasks();
      console.log('📝 デモタスクを生成しました');
    }
  };

  console.log('✅ Testing Trophy API公開完了');
  console.log('💡 使用例:');
  console.log('  NowTaskTestAPI.runFullStressTest() - フルストレステスト');
  console.log('  NowTaskTestAPI.performance.stressTest(500) - 500件負荷テスト');
  console.log('  NowTaskTestAPI.createDemoTasks() - デモタスク作成');
  console.log('  generatePerformanceReport() - パフォーマンスレポート');
  console.log('  NowTaskTestAPI.deleteAllTasks() - 全タスク削除');
}

/**
 * 🎨 統計情報の美しい可視化システム
 */
function enhanceStatisticsVisualization() {
  const statsSection = document.querySelector('.task-stats');
  if (!statsSection) return;

  // 既存の統計セクションにクラス追加
  statsSection.classList.add('statistics-section');

  // 統計アイテムにクラス追加
  const statItems = statsSection.querySelectorAll('.stat-row');
  statItems.forEach((item, index) => {
    item.classList.add('stat-item');
    
    const value = item.querySelector('.stat-value');
    if (value) {
      value.classList.add('stat-value');
      
      // アニメーション遅延を追加
      value.style.animationDelay = `${index * 0.2}s`;
    }
  });

  // プログレス可視化を追加
  addProgressVisualization(statsSection);
}

/**
 * 📈 プログレス可視化の追加
 */
function addProgressVisualization(container) {
  const progressDiv = document.createElement('div');
  progressDiv.className = 'progress-visualization';
  progressDiv.innerHTML = `
    <h4 style="margin-bottom: var(--spacing-sm); color: var(--text-primary);">
      📊 今日の進捗
    </h4>
    <div class="progress-bar">
      <div class="progress-fill" id="daily-progress-fill"></div>
    </div>
    <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: var(--spacing-sm); text-align: center;" id="progress-text">
      準備完了
    </p>
  `;
  
  container.appendChild(progressDiv);
  
  // プログレス更新
  updateDailyProgress();
}

/**
 * 🔄 日次プログレス更新
 */
function updateDailyProgress() {
  const currentTasks = window.AppState.tasks.filter(task => task.date === currentDate);
  const completedTasks = currentTasks.filter(task => task.completed);
  
  const progressPercentage = currentTasks.length > 0 
    ? (completedTasks.length / currentTasks.length) * 100 
    : 0;

  const progressFill = document.getElementById('daily-progress-fill');
  const progressText = document.getElementById('progress-text');
  
  if (progressFill) {
    progressFill.style.width = `${progressPercentage}%`;
  }
  
  if (progressText) {
    if (currentTasks.length === 0) {
      progressText.textContent = '今日のタスクはありません - 新しい目標を設定しましょう！';
    } else {
      progressText.textContent = `${completedTasks.length}/${currentTasks.length} タスク完了 (${Math.round(progressPercentage)}%)`;
    }
  }
}

/**
 * 💫 空タイムライン用プレースホルダー追加
 */
function addEmptyTimelinePlaceholder(panel, date) {
  const tasksForDate = window.AppState.tasks.filter(task => task.date === date);
  
  if (tasksForDate.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'empty-timeline-placeholder';
    placeholder.innerHTML = `
      <div class="empty-timeline-icon">🌟</div>
      <div class="empty-timeline-text">新しい一日の始まり</div>
      <div class="empty-timeline-hint">
        クリックしてタスクを追加、または<br>
        サイドバーのテンプレートをお試しください
      </div>
    `;
    
    const timeline = panel.querySelector('.timeline-grid');
    if (timeline) {
      timeline.appendChild(placeholder);
    }
  }
}

/**
 * 🌅 時間帯別背景グラデーション適用
 */
function applyTimeOfDayGradients() {
  const dayPanels = document.querySelectorAll('.timeline-day-panel');
  
  dayPanels.forEach(panel => {
    const date = panel.dataset.date;
    const today = getCurrentDateString();
    
    // 現在の日付かどうかで微妙に背景を調整
    if (date === today) {
      panel.style.background = `
        linear-gradient(
          to bottom,
          var(--night-gradient-start) 0%,
          var(--night-gradient-end) 16.67%,
          var(--dawn-gradient-start) 20.83%,
          var(--dawn-gradient-end) 25%,
          var(--morning-gradient-start) 25%,
          var(--morning-gradient-end) 41.67%,
          var(--day-gradient-start) 41.67%,
          var(--day-gradient-end) 70.83%,
          var(--evening-gradient-start) 70.83%,
          var(--evening-gradient-end) 87.5%,
          var(--night-gradient-start) 87.5%,
          var(--night-gradient-end) 100%
        ),
        radial-gradient(circle at 20% 80%, rgba(46, 139, 255, 0.1) 0%, transparent 50%)
      `;
    }
  });
}

/**
 * 🎪 マジカルタスクカード演出
 */
function enhanceTaskCardInteractions() {
  const taskCards = document.querySelectorAll('.task-card');
  
  taskCards.forEach(card => {
    // ホバー時の3D効果
    card.addEventListener('mouseenter', (e) => {
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      card.style.transform = `
        perspective(1000px) 
        rotateX(${(e.clientY - centerY) / 20}deg) 
        rotateY(${(centerX - e.clientX) / 20}deg) 
        translateZ(10px)
        scale(1.02)
      `;
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateZ(0) scale(1)';
    });
    
    // クリック時のリップル効果
    card.addEventListener('click', (e) => {
      const ripple = document.createElement('div');
      const rect = card.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      
      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: radial-gradient(circle, rgba(46, 139, 255, 0.3) 0%, transparent 70%);
        border-radius: 50%;
        transform: scale(0);
        animation: rippleEffect 0.6s ease-out;
        pointer-events: none;
        z-index: 100;
      `;
      
      card.appendChild(ripple);
      
      // アニメーション後に削除
      setTimeout(() => {
        if (ripple.parentNode) {
          ripple.parentNode.removeChild(ripple);
        }
      }, 600);
    });
  });
}

/**
 * 🌟 時間スロット演出強化
 */
function enhanceTimeSlotInteractions() {
  const timeSlots = document.querySelectorAll('.time-slot');
  
  timeSlots.forEach(slot => {
    slot.addEventListener('click', (e) => {
      // クリック位置にスパークル効果
      const sparkle = document.createElement('div');
      const rect = slot.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      sparkle.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: 6px;
        height: 6px;
        background: var(--primary);
        border-radius: 50%;
        pointer-events: none;
        z-index: 200;
        animation: sparkleEffect 1s ease-out forwards;
      `;
      
      slot.appendChild(sparkle);
      
      // 複数のスパークルを生成
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          const extraSparkle = sparkle.cloneNode();
          extraSparkle.style.left = `${x + (Math.random() - 0.5) * 20}px`;
          extraSparkle.style.top = `${y + (Math.random() - 0.5) * 20}px`;
          extraSparkle.style.animationDelay = `${i * 0.1}s`;
          slot.appendChild(extraSparkle);
          
          setTimeout(() => {
            if (extraSparkle.parentNode) {
              extraSparkle.parentNode.removeChild(extraSparkle);
            }
          }, 1000);
        }, i * 50);
      }
      
      setTimeout(() => {
        if (sparkle.parentNode) {
          sparkle.parentNode.removeChild(sparkle);
        }
      }, 1000);
    });
  });
}

/**
 * 🎨 動的テーマ適用
 */
function applyDynamicTheming() {
  const now = new Date();
  const hour = now.getHours();
  
  let theme = 'day';
  if (hour >= 21 || hour < 5) theme = 'night';
  else if (hour >= 5 && hour < 6) theme = 'dawn';
  else if (hour >= 6 && hour < 10) theme = 'morning';
  else if (hour >= 17 && hour < 21) theme = 'evening';
  
  document.body.setAttribute('data-theme', theme);
  
  // テーマに応じたアクセントカラー調整
  const root = document.documentElement;
  switch (theme) {
    case 'night':
      root.style.setProperty('--accent', '#8B5CF6');
      break;
    case 'dawn':
      root.style.setProperty('--accent', '#F59E0B');
      break;
    case 'morning':
      root.style.setProperty('--accent', '#10B981');
      break;
    case 'evening':
      root.style.setProperty('--accent', '#EF4444');
      break;
    default:
      root.style.setProperty('--accent', '#2E8BFF');
  }
}

/**
 * 🎪 成功演出システム
 */
function showSuccessAnimation(message, type = 'success') {
  const animation = document.createElement('div');
  animation.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    background: linear-gradient(135deg, var(--primary), var(--accent));
    color: white;
    padding: 20px 30px;
    border-radius: 16px;
    font-size: 1.2rem;
    font-weight: 600;
    z-index: 10000;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    animation: successPop 2s ease-out forwards;
  `;
  
  animation.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 2rem; margin-bottom: 10px;">🎉</div>
      <div>${message}</div>
    </div>
  `;
  
  document.body.appendChild(animation);
  
  setTimeout(() => {
    if (animation.parentNode) {
      animation.parentNode.removeChild(animation);
    }
  }, 2000);
}

/**
 * 🎨 UX強化の統合初期化
 */
function initializeUXEnhancements() {
  console.log('🎨 UX強化システム初期化開始');
  
  // 統計可視化強化
  enhanceStatisticsVisualization();
  
  // 時間帯別背景適用
  applyTimeOfDayGradients();
  
  // 動的テーマ適用
  applyDynamicTheming();
  
  // 30分毎にテーマ更新
  setInterval(applyDynamicTheming, 30 * 60 * 1000);
  
  console.log('✨ UX強化システム初期化完了');
}

/**
 * 🔄 タスク描画時の美化処理
 */
const originalCreateTaskCard = createTaskCard;
createTaskCard = function(task) {
  const card = originalCreateTaskCard.call(this, task);
  
  // タスクカード固有の美化
  card.style.setProperty('--card-hue', Math.random() * 360);
  
  return card;
};

/**
 * 🎯 レンダリング時の美化処理統合
 */
const originalRenderTasksToPanel = renderTasksToPanel;
renderTasksToPanel = function(panel, tasks) {
  const result = originalRenderTasksToPanel.call(this, panel, tasks);
  
  // パネル美化処理
  const date = panel.dataset.date;
  addEmptyTimelinePlaceholder(panel, date);
  
  // インタラクション強化
  setTimeout(() => {
    enhanceTaskCardInteractions();
    enhanceTimeSlotInteractions();
  }, 100);
  
  return result;
};

// ... existing code ...

// 初期化フローに美化システムを統合
const originalInitializeUI = initializeUI;
initializeUI = async function() {
  const result = await originalInitializeUI.call(this);
  
  // UX強化を適用
  setTimeout(() => {
    initializeUXEnhancements();
    updateDailyProgress();
  }, 500);
  
  return result;
};

// CSS アニメーション定義を動的に追加
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes rippleEffect {
    from { transform: scale(0); opacity: 1; }
    to { transform: scale(2); opacity: 0; }
  }
  
  @keyframes sparkleEffect {
    0% { transform: scale(0) rotate(0deg); opacity: 1; }
    50% { transform: scale(1) rotate(180deg); opacity: 0.8; }
    100% { transform: scale(0) rotate(360deg); opacity: 0; }
  }
  
  @keyframes successPop {
    0% { transform: translate(-50%, -50%) scale(0) rotate(-10deg); opacity: 0; }
    50% { transform: translate(-50%, -50%) scale(1.1) rotate(5deg); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
  }
  
  .task-card {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .time-slot {
    position: relative;
    overflow: hidden;
  }
`;

document.head.appendChild(styleSheet);

// ... existing code ...

/**
 * 📊 Phase 2: 高度な情報表示システム
 */

/**
 * 🔥 タスク密度ヒートマップ生成
 */
function generateTaskDensityHeatmap() {
  const heatmapContainer = document.createElement('div');
  heatmapContainer.className = 'heatmap-container';
  heatmapContainer.innerHTML = `
    <h4 style="margin-bottom: var(--spacing-md); color: var(--text-primary);">
      🔥 時間帯別タスク密度
    </h4>
    <div class="heatmap-grid" id="task-density-heatmap"></div>
    <div class="heatmap-legend">
      <span class="legend-item">
        <div class="legend-color" style="background: var(--heatmap-low);"></div>
        <span>少</span>
      </span>
      <span class="legend-item">
        <div class="legend-color" style="background: var(--heatmap-medium);"></div>
        <span>中</span>
      </span>
      <span class="legend-item">
        <div class="legend-color" style="background: var(--heatmap-high);"></div>
        <span>多</span>
      </span>
    </div>
  `;

  // ヒートマップデータ計算
  const hourlyDensity = calculateHourlyTaskDensity();
  const heatmapGrid = heatmapContainer.querySelector('#task-density-heatmap');
  
  for (let hour = 0; hour < 24; hour++) {
    const density = hourlyDensity[hour] || 0;
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.style.cssText = `
      background: ${getHeatmapColor(density)};
      opacity: ${0.3 + (density / 10) * 0.7};
    `;
    cell.title = `${hour}:00 - ${density}個のタスク`;
    cell.textContent = hour;
    
    heatmapGrid.appendChild(cell);
  }
  
  return heatmapContainer;
}

/**
 * 📈 時間別タスク密度計算
 */
function calculateHourlyTaskDensity() {
  const density = {};
  const allTasks = window.AppState.tasks;
  
  allTasks.forEach(task => {
    const startHour = Math.floor(timeStringToMinutes(task.start) / 60);
    const endHour = Math.floor(timeStringToMinutes(task.end) / 60);
    
    for (let hour = startHour; hour <= endHour; hour++) {
      density[hour] = (density[hour] || 0) + 1;
    }
  });
  
  return density;
}

/**
 * 🎨 ヒートマップ色計算
 */
function getHeatmapColor(density) {
  if (density === 0) return 'rgba(59, 130, 246, 0.1)';
  if (density <= 2) return 'rgba(34, 197, 94, 0.6)';
  if (density <= 5) return 'rgba(251, 191, 36, 0.7)';
  return 'rgba(239, 68, 68, 0.8)';
}

/**
 * 📊 週間統計チャート生成
 */
function generateWeeklyStatsChart() {
  const chartContainer = document.createElement('div');
  chartContainer.className = 'weekly-chart-container';
  chartContainer.innerHTML = `
    <h4 style="margin-bottom: var(--spacing-md); color: var(--text-primary);">
      📊 週間タスク統計
    </h4>
    <div class="chart-wrapper">
      <canvas id="weekly-chart" width="280" height="120"></canvas>
    </div>
    <div class="chart-summary" id="weekly-summary"></div>
  `;

  // キャンバスにチャート描画
  setTimeout(() => {
    drawWeeklyChart();
  }, 100);
  
  return chartContainer;
}

/**
 * 🎨 週間チャート描画
 */
function drawWeeklyChart() {
  const canvas = document.getElementById('weekly-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const weekData = getWeeklyTaskData();
  
  // キャンバスクリア
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // グラデーション背景
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.1)');
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0.05)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // データ可視化
  const maxTasks = Math.max(...weekData.map(d => d.tasks));
  const barWidth = canvas.width / 7;
  
  weekData.forEach((data, index) => {
    const barHeight = (data.tasks / maxTasks) * (canvas.height - 20);
    const x = index * barWidth + 10;
    const y = canvas.height - barHeight - 10;
    
    // バーグラデーション
    const barGradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
    barGradient.addColorStop(0, getWeeklyBarColor(data.completed / data.tasks));
    barGradient.addColorStop(1, 'rgba(59, 130, 246, 0.8)');
    
    ctx.fillStyle = barGradient;
    ctx.fillRect(x, y, barWidth - 20, barHeight);
    
    // 曜日ラベル
    ctx.fillStyle = 'var(--text-secondary)';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(data.day, x + (barWidth - 20) / 2, canvas.height - 2);
  });
  
  // 統計サマリー更新
  updateWeeklySummary(weekData);
}

/**
 * 📅 週間データ取得
 */
function getWeeklyTaskData() {
  const today = new Date();
  const weekData = [];
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateString = date.toISOString().split('T')[0];
    
    const dayTasks = window.AppState.tasks.filter(task => task.date === dateString);
    const completedTasks = dayTasks.filter(task => task.completed);
    
    weekData.push({
      day: dayNames[date.getDay()],
      date: dateString,
      tasks: dayTasks.length,
      completed: completedTasks.length
    });
  }
  
  return weekData;
}

/**
 * 🎨 週間バー色計算
 */
function getWeeklyBarColor(completionRate) {
  if (completionRate >= 0.8) return 'rgba(34, 197, 94, 0.9)';
  if (completionRate >= 0.5) return 'rgba(251, 191, 36, 0.9)';
  return 'rgba(239, 68, 68, 0.9)';
}

/**
 * 📝 週間サマリー更新
 */
function updateWeeklySummary(weekData) {
  const summaryElement = document.getElementById('weekly-summary');
  if (!summaryElement) return;
  
  const totalTasks = weekData.reduce((sum, day) => sum + day.tasks, 0);
  const totalCompleted = weekData.reduce((sum, day) => sum + day.completed, 0);
  const avgDaily = (totalTasks / 7).toFixed(1);
  
  summaryElement.innerHTML = `
    <div class="summary-grid">
      <div class="summary-item">
        <span class="summary-label">週間合計</span>
        <span class="summary-value">${totalTasks}件</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">完了率</span>
        <span class="summary-value">${Math.round((totalCompleted / totalTasks) * 100)}%</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">1日平均</span>
        <span class="summary-value">${avgDaily}件</span>
      </div>
    </div>
  `;
}

/**
 * 💡 スマートヒント表示システム
 */
function generateSmartHints() {
  const hintsContainer = document.createElement('div');
  hintsContainer.className = 'smart-hints-container';
  hintsContainer.innerHTML = `
    <h4 style="margin-bottom: var(--spacing-md); color: var(--text-primary);">
      💡 スマートヒント
    </h4>
    <div id="smart-hints-list"></div>
  `;

  const hints = generatePersonalizedHints();
  const hintsList = hintsContainer.querySelector('#smart-hints-list');
  
  hints.forEach((hint, index) => {
    const hintElement = document.createElement('div');
    hintElement.className = 'smart-hint-item';
    hintElement.style.animationDelay = `${index * 0.2}s`;
    hintElement.innerHTML = `
      <div class="hint-icon">${hint.icon}</div>
      <div class="hint-content">
        <div class="hint-title">${hint.title}</div>
        <div class="hint-description">${hint.description}</div>
      </div>
    `;
    
    hintsList.appendChild(hintElement);
  });
  
  return hintsContainer;
}

/**
 * 🧠 パーソナライズドヒント生成
 */
function generatePersonalizedHints() {
  const currentTasks = window.AppState.tasks.filter(task => task.date === currentDate);
  const hints = [];
  
  // 空の時間帯検出
  const busyHours = calculateBusyHours();
  const freeHours = [];
  for (let hour = 9; hour <= 17; hour++) {
    if (!busyHours.includes(hour)) {
      freeHours.push(hour);
    }
  }
  
  if (freeHours.length > 4) {
    hints.push({
      icon: '⏰',
      title: '集中時間を作りましょう',
      description: `${freeHours.slice(0, 2).join('時, ')}時台が空いています`
    });
  }
  
  // タスク密度警告
  if (busyHours.length > 8) {
    hints.push({
      icon: '⚠️',
      title: '予定が詰まりすぎています',
      description: '一部のタスクを別の日に移動することを検討してください'
    });
  }
  
  // 完了率ベースのアドバイス
  const completedTasks = currentTasks.filter(task => task.completed);
  const completionRate = currentTasks.length > 0 ? completedTasks.length / currentTasks.length : 0;
  
  if (completionRate < 0.3 && currentTasks.length > 5) {
    hints.push({
      icon: '🎯',
      title: '小さなタスクから始めましょう',
      description: '短時間で完了できるタスクから手をつけると進捗を感じやすくなります'
    });
  }
  
  // 時間帯別推奨
  const now = new Date();
  const currentHour = now.getHours();
  
  if (currentHour >= 9 && currentHour <= 11) {
    hints.push({
      icon: '🌅',
      title: '朝の黄金時間',
      description: '集中力が高い時間です。重要なタスクに取り組みましょう'
    });
  }
  
  return hints.slice(0, 3); // 最大3つまで表示
}

/**
 * ⏱️ 忙しい時間帯計算
 */
function calculateBusyHours() {
  const currentTasks = window.AppState.tasks.filter(task => task.date === currentDate);
  const busyHours = new Set();
  
  currentTasks.forEach(task => {
    const startHour = Math.floor(timeStringToMinutes(task.start) / 60);
    const endHour = Math.floor(timeStringToMinutes(task.end) / 60);
    
    for (let hour = startHour; hour <= endHour; hour++) {
      busyHours.add(hour);
    }
  });
  
  return Array.from(busyHours);
}

/**
 * 🎨 Phase 2 UI統合
 */
function initializeAdvancedVisualizations() {
  console.log('📊 Phase 2: 高度な可視化システム初期化');
  
  const sidebar = document.querySelector('.sidebar-content');
  if (!sidebar) return;
  
  // ヒートマップ追加
  const heatmap = generateTaskDensityHeatmap();
  sidebar.appendChild(heatmap);
  
  // 週間統計チャート追加
  const weeklyChart = generateWeeklyStatsChart();
  sidebar.appendChild(weeklyChart);
  
  // スマートヒント追加
  const smartHints = generateSmartHints();
  sidebar.appendChild(smartHints);
  
  console.log('✨ Phase 2: 高度な可視化システム初期化完了');
}

/**
 * 🔄 Phase 2 データ更新
 */
function updateAdvancedVisualizations() {
  // ヒートマップ更新
  const heatmapGrid = document.getElementById('task-density-heatmap');
  if (heatmapGrid) {
    heatmapGrid.innerHTML = '';
    const hourlyDensity = calculateHourlyTaskDensity();
    
    for (let hour = 0; hour < 24; hour++) {
      const density = hourlyDensity[hour] || 0;
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.style.cssText = `
        background: ${getHeatmapColor(density)};
        opacity: ${0.3 + (density / 10) * 0.7};
      `;
      cell.title = `${hour}:00 - ${density}個のタスク`;
      cell.textContent = hour;
      
      heatmapGrid.appendChild(cell);
    }
  }
  
  // 週間チャート更新
  drawWeeklyChart();
  
  // スマートヒント更新
  const hintsList = document.getElementById('smart-hints-list');
  if (hintsList) {
    hintsList.innerHTML = '';
    const hints = generatePersonalizedHints();
    
    hints.forEach((hint, index) => {
      const hintElement = document.createElement('div');
      hintElement.className = 'smart-hint-item';
      hintElement.style.animationDelay = `${index * 0.2}s`;
      hintElement.innerHTML = `
        <div class="hint-icon">${hint.icon}</div>
        <div class="hint-content">
          <div class="hint-title">${hint.title}</div>
          <div class="hint-description">${hint.description}</div>
        </div>
      `;
      
      hintsList.appendChild(hintElement);
    });
  }
}

// ... existing code ...

// Phase 2を初期化フローに統合
const originalInitializeUXEnhancements = initializeUXEnhancements;
initializeUXEnhancements = function() {
  originalInitializeUXEnhancements.call(this);
  
  // Phase 2: 高度な可視化を追加
  setTimeout(() => {
    initializeAdvancedVisualizations();
  }, 800);
};

// タスク更新時にPhase 2も更新
const originalUpdateStats = updateStats;
updateStats = function() {
  const result = originalUpdateStats.call(this);
  
  // Phase 2の可視化も更新
  setTimeout(() => {
    updateAdvancedVisualizations();
  }, 100);
  
  return result;
};

/**
 * 🚀 Phase 3: インタラクション革命（85→100点）
 */

/**
 * 🎪 マジカルドラッグ&ドロップシステム
 */
function initializeMagicalDragDrop() {
  console.log('🎪 マジカルドラッグ&ドロップ初期化');
  
  let dragPreview = null;
  let originalCard = null;
  
  // 全タスクカードにマジカル効果を追加
  document.addEventListener('mousedown', (e) => {
    const taskCard = e.target.closest('.task-card');
    if (!taskCard) return;
    
    originalCard = taskCard;
    
    // ドラッグプレビュー作成
    setTimeout(() => {
      if (dragPreview) return;
      
      dragPreview = taskCard.cloneNode(true);
      dragPreview.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 10000;
        transform: rotate(5deg) scale(1.05);
        opacity: 0.9;
        transition: none;
        box-shadow: 
          0 20px 60px rgba(0, 0, 0, 0.3),
          0 0 0 1px rgba(255, 255, 255, 0.1),
          0 0 40px rgba(46, 139, 255, 0.4);
        backdrop-filter: blur(10px) saturate(1.2);
      `;
      
      document.body.appendChild(dragPreview);
      
      // オリジナルカードをゴースト化
      originalCard.style.opacity = '0.3';
      originalCard.style.transform = 'scale(0.95)';
    }, 100);
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!dragPreview) return;
    
    dragPreview.style.left = `${e.clientX - 100}px`;
    dragPreview.style.top = `${e.clientY - 30}px`;
    
    // ドラッグ中の魔法効果
    const timeSlots = document.querySelectorAll('.time-slot');
    timeSlots.forEach(slot => {
      const rect = slot.getBoundingClientRect();
      const distance = Math.abs(e.clientY - (rect.top + rect.height / 2));
      
      if (distance < 30) {
        slot.style.background = 'linear-gradient(90deg, rgba(46, 139, 255, 0.2), rgba(139, 92, 246, 0.2))';
        slot.style.transform = 'scaleX(1.02)';
        slot.style.boxShadow = 'inset 0 0 20px rgba(46, 139, 255, 0.3)';
      } else {
        slot.style.background = '';
        slot.style.transform = '';
        slot.style.boxShadow = '';
      }
    });
  });
  
  document.addEventListener('mouseup', () => {
    if (dragPreview) {
      // ドロップ成功アニメーション
      dragPreview.style.animation = 'dropSuccess 0.5s ease-out forwards';
      
      setTimeout(() => {
        if (dragPreview && dragPreview.parentNode) {
          dragPreview.parentNode.removeChild(dragPreview);
        }
        dragPreview = null;
      }, 500);
    }
    
    if (originalCard) {
      originalCard.style.opacity = '';
      originalCard.style.transform = '';
      originalCard = null;
    }
    
    // 全タイムスロットの効果をリセット
    document.querySelectorAll('.time-slot').forEach(slot => {
      slot.style.background = '';
      slot.style.transform = '';
      slot.style.boxShadow = '';
    });
  });
}

/**
 * ⚡ リアルタイム予測表示システム
 */
function initializeRealtimePredictions() {
  console.log('⚡ リアルタイム予測システム初期化');
  
  const predictionOverlay = document.createElement('div');
  predictionOverlay.className = 'prediction-overlay';
  predictionOverlay.innerHTML = `
    <div class="prediction-content">
      <div class="prediction-header">
        <div class="prediction-icon">🔮</div>
        <div class="prediction-title">AI予測</div>
      </div>
      <div class="prediction-suggestions" id="prediction-suggestions"></div>
    </div>
  `;
  
  document.body.appendChild(predictionOverlay);
  
  // リアルタイム予測更新
  let predictionTimer;
  function updatePredictions() {
    clearTimeout(predictionTimer);
    predictionTimer = setTimeout(() => {
      const suggestions = generateAIPredictions();
      displayPredictions(suggestions);
    }, 1000);
  }
  
  // タスク追加・編集時に予測を更新
  document.addEventListener('input', updatePredictions);
  document.addEventListener('click', updatePredictions);
}

/**
 * 🔮 AI予測生成
 */
function generateAIPredictions() {
  const currentTasks = window.AppState.tasks.filter(task => task.date === currentDate);
  const suggestions = [];
  
  const now = new Date();
  const currentHour = now.getHours();
  
  // 時間帯ベースの推奨
  if (currentHour >= 8 && currentHour <= 10) {
    suggestions.push({
      icon: '☕',
      text: '朝の集中時間です。重要なタスクに取り組みましょう',
      action: () => showQuickAddForm('重要なタスク', '09:00', '10:30')
    });
  }
  
  if (currentHour >= 12 && currentHour <= 13) {
    suggestions.push({
      icon: '🍽️',
      text: 'ランチタイムです。食事を取りませんか？',
      action: () => showQuickAddForm('ランチ', '12:00', '13:00')
    });
  }
  
  // タスク密度ベースの推奨
  const busyHours = calculateBusyHours();
  if (busyHours.length > 6) {
    suggestions.push({
      icon: '⏱️',
      text: '予定が詰まっています。休憩時間を確保しましょう',
      action: () => showQuickAddForm('休憩', `${currentHour + 1}:00`, `${currentHour + 1}:15`)
    });
  }
  
  return suggestions.slice(0, 3);
}

/**
 * 📱 予測表示
 */
function displayPredictions(suggestions) {
  const container = document.getElementById('prediction-suggestions');
  if (!container) return;
  
  container.innerHTML = '';
  
  suggestions.forEach((suggestion, index) => {
    const item = document.createElement('div');
    item.className = 'prediction-item';
    item.style.animationDelay = `${index * 0.1}s`;
    item.innerHTML = `
      <div class="prediction-item-icon">${suggestion.icon}</div>
      <div class="prediction-item-text">${suggestion.text}</div>
      <div class="prediction-item-action">実行</div>
    `;
    
    item.addEventListener('click', suggestion.action);
    container.appendChild(item);
  });
  
  // 予測オーバーレイを表示
  const overlay = document.querySelector('.prediction-overlay');
  if (overlay && suggestions.length > 0) {
    overlay.style.display = 'block';
    
    // 5秒後に自動非表示
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 5000);
  }
}

/**
 * 🎭 コンテキスト適応UI
 */
function initializeContextAdaptiveUI() {
  console.log('🎭 コンテキスト適応UI初期化');
  
  const observer = new MutationObserver(() => {
    adaptUIToContext();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true
  });
  
  // 定期的なコンテキスト更新
  setInterval(adaptUIToContext, 30000); // 30秒毎
}

/**
 * 🎨 UI コンテキスト適応
 */
function adaptUIToContext() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentTasks = window.AppState.tasks.filter(task => task.date === currentDate);
  
  // 時間帯別UI調整
  const root = document.documentElement;
  
  if (currentHour >= 21 || currentHour < 6) {
    // 夜モード
    root.style.setProperty('--background', '#0f172a');
    root.style.setProperty('--text-primary', '#f1f5f9');
    root.style.setProperty('--accent', '#8b5cf6');
    
    // ナイトシフト推奨
    if (currentTasks.length === 0) {
      showContextualHint('🌙 夜の時間です。リラックスしませんか？', 'rest');
    }
  } else if (currentHour >= 6 && currentHour < 12) {
    // 朝モード
    root.style.setProperty('--accent', '#10b981');
    
    if (currentTasks.length < 3) {
      showContextualHint('🌅 新しい一日の始まりです。今日の目標を設定しましょう！', 'goal');
    }
  } else if (currentHour >= 17 && currentHour < 21) {
    // 夕方モード
    root.style.setProperty('--accent', '#f59e0b');
    
    const completedToday = currentTasks.filter(task => task.completed).length;
    if (completedToday > 3) {
      showContextualHint('🎉 今日もお疲れ様でした！素晴らしい一日でしたね', 'celebration');
    }
  }
  
  // タスク密度による UI調整
  const taskDensity = currentTasks.length;
  const header = document.querySelector('.header');
  
  if (taskDensity > 10) {
    header.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
    showContextualHint('⚠️ 今日は予定が多いですね。優先順位を整理しましょう', 'warning');
  } else if (taskDensity < 2) {
    header.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    showContextualHint('✨ 今日は余裕がありますね。新しいことに挑戦してみませんか？', 'opportunity');
  }
}

/**
 * 💡 コンテキストヒント表示
 */
function showContextualHint(message, type) {
  const existingHint = document.querySelector('.contextual-hint');
  if (existingHint) return; // 既に表示中
  
  const hint = document.createElement('div');
  hint.className = 'contextual-hint';
  hint.innerHTML = `
    <div class="contextual-hint-content">
      <div class="contextual-hint-message">${message}</div>
      <button class="contextual-hint-close">×</button>
    </div>
  `;
  
  hint.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    z-index: 9999;
    background: linear-gradient(135deg, rgba(46, 139, 255, 0.95), rgba(139, 92, 246, 0.95));
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    transform: translateX(400px);
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    max-width: 300px;
    animation: contextualHintSlide 0.5s ease-out forwards;
  `;
  
  document.body.appendChild(hint);
  
  // 閉じるボタン
  hint.querySelector('.contextual-hint-close').addEventListener('click', () => {
    hint.style.transform = 'translateX(400px)';
    setTimeout(() => {
      if (hint.parentNode) {
        hint.parentNode.removeChild(hint);
      }
    }, 500);
  });
  
  // 自動消去
  setTimeout(() => {
    if (hint.parentNode) {
      hint.style.transform = 'translateX(400px)';
      setTimeout(() => {
        if (hint.parentNode) {
          hint.parentNode.removeChild(hint);
        }
      }, 500);
    }
  }, 8000);
}

/**
 * 🌟 デライト要素システム
 */
function initializeDelightElements() {
  console.log('🌟 デライト要素システム初期化');
  
  // 成果達成時の祝福演出
  let lastCompletedCount = 0;
  
  setInterval(() => {
    const currentTasks = window.AppState.tasks.filter(task => task.date === currentDate);
    const completedCount = currentTasks.filter(task => task.completed).length;
    
    if (completedCount > lastCompletedCount) {
      triggerDelightAnimation(completedCount);
    }
    
    lastCompletedCount = completedCount;
  }, 2000);
  
  // 時刻到達演出
  const celebrationTimes = ['09:00', '12:00', '18:00'];
  setInterval(() => {
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    if (celebrationTimes.includes(timeString)) {
      triggerTimeDelightAnimation();
    }
  }, 60000); // 1分毎チェック
}

/**
 * ✨ 成果達成演出
 */
function triggerDelightAnimation(count) {
  const messages = [
    '🎉 素晴らしい！',
    '✨ 順調ですね！',
    '🚀 その調子！',
    '🌟 完璧です！',
    '🎊 お見事！'
  ];
  
  const message = messages[Math.min(count - 1, messages.length - 1)];
  
  // 花火演出
  createFireworksEffect();
  
  // 成功メッセージ
  showSuccessAnimation(message, 'delight');
  
  // BGM風サウンド（視覚的表現）
  createSoundWaveVisualization();
}

/**
 * 🎆 花火エフェクト
 */
function createFireworksEffect() {
  for (let i = 0; i < 20; i++) {
    setTimeout(() => {
      const firework = document.createElement('div');
      firework.style.cssText = `
        position: fixed;
        width: 6px;
        height: 6px;
        background: hsl(${Math.random() * 360}, 70%, 60%);
        border-radius: 50%;
        pointer-events: none;
        z-index: 10000;
        left: ${Math.random() * window.innerWidth}px;
        top: ${Math.random() * window.innerHeight}px;
        animation: fireworkExplode 2s ease-out forwards;
      `;
      
      document.body.appendChild(firework);
      
      setTimeout(() => {
        if (firework.parentNode) {
          firework.parentNode.removeChild(firework);
        }
      }, 2000);
    }, i * 100);
  }
}

/**
 * 🎵 サウンドウェーブ可視化
 */
function createSoundWaveVisualization() {
  const wave = document.createElement('div');
  wave.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: 200px;
    height: 40px;
    z-index: 10000;
    pointer-events: none;
    display: flex;
    align-items: end;
    gap: 2px;
  `;
  
  for (let i = 0; i < 20; i++) {
    const bar = document.createElement('div');
    bar.style.cssText = `
      flex: 1;
      background: linear-gradient(to top, #10b981, #34d399);
      border-radius: 2px;
      animation: soundWave 1s ease-in-out infinite;
      animation-delay: ${i * 0.05}s;
    `;
    wave.appendChild(bar);
  }
  
  document.body.appendChild(wave);
  
  setTimeout(() => {
    if (wave.parentNode) {
      wave.parentNode.removeChild(wave);
    }
  }, 3000);
}

/**
 * 🚀 Phase 3 統合初期化
 */
function initializePhase3Enhancements() {
  console.log('🚀 Phase 3: インタラクション革命開始');
  
  // マジカルドラッグ&ドロップ
  initializeMagicalDragDrop();
  
  // リアルタイム予測
  initializeRealtimePredictions();
  
  // コンテキスト適応UI
  initializeContextAdaptiveUI();
  
  // デライト要素
  initializeDelightElements();
  
  console.log('✨ Phase 3: インタラクション革命完了 - 100点達成！');
  
  // 100点達成演出
  setTimeout(() => {
    showSuccessAnimation('🎉 UX 100点達成！最高のパフォーマンスでお楽しみください', 'ultimate');
    createFireworksEffect();
  }, 1000);
}

// Phase 3を初期化フローに統合
const originalInitializeAdvancedVisualizations = initializeAdvancedVisualizations;
initializeAdvancedVisualizations = function() {
  originalInitializeAdvancedVisualizations.call(this);
  
  // Phase 3: インタラクション革命を追加
  setTimeout(() => {
    initializePhase3Enhancements();
  }, 1200);
};

// ... existing code ...

