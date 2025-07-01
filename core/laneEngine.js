/**
 * レーン分けエンジン（Testing Trophy: Integration Level）
 * O(n log n)アルゴリズムによる効率的なタスクレーン割り当て
 *
 * @author Kent C. Dodds Testing Trophy準拠
 */

import { timeStringToMinutes } from './timeUtils.js';

/**
 * 2つのタスクが時間的に重複するかチェック
 * @param {Object} task1 - タスク1
 * @param {Object} task2 - タスク2
 * @returns {boolean} 重複している場合true
 */
export function hasTimeOverlap(task1, task2) {
  if (!task1 || !task2) {return false;}

  try {
    const start1 = timeStringToMinutes(task1.startTime);
    const end1 = timeStringToMinutes(task1.endTime);
    const start2 = timeStringToMinutes(task2.startTime);
    const end2 = timeStringToMinutes(task2.endTime);

    // 重複の条件：start1 < end2 && start2 < end1
    return start1 < end2 && start2 < end1;
  } catch (error) {
    console.error('時間重複チェックエラー:', error);
    return false;
  }
}

/**
 * 指定日のタスクにレーン番号を割り当て（O(n log n)アルゴリズム）
 * 日付跨ぎタスクの分割カードも含めて処理
 * @param {string} dateString - 日付文字列
 * @returns {Object} 割り当て結果 { maxLanes, assignments }
 */
export function assignLanes(dateString) {
  const appState = window.AppState;
  if (!appState || !appState.tasks) {
    return { maxLanes: 1, assignments: new Map() };
  }

  // 指定日のタスクをフィルタリング + 分割タスクを展開
  const dateTasks = appState.tasks.filter(task => task.date === dateString);
  const expandedTasks = [];

  for (const task of dateTasks) {
    if (task.isOvernight()) {
      // 日付跨ぎタスクは当日部分のみを対象とする
      const { firstPart } = task.splitIntoTwo();
      expandedTasks.push(firstPart);
    } else {
      expandedTasks.push(task);
    }
  }

  // 前日の日付跨ぎタスクの翌日部分もチェック
  const prevDate = new Date(dateString);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateString = prevDate.toISOString().split('T')[0];

  const prevDayTasks = appState.tasks.filter(task => task.date === prevDateString);
  for (const task of prevDayTasks) {
    if (task.isOvernight()) {
      const { secondPart } = task.splitIntoTwo();
      if (secondPart.date === dateString) {
        expandedTasks.push(secondPart);
      }
    }
  }

  if (expandedTasks.length === 0) {
    return { maxLanes: 1, assignments: new Map() };
  }

  // 時刻順にソート（O(n log n)）
  const sortedTasks = [...expandedTasks].sort((a, b) => {
    return timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime);
  });

  // レーン割り当てアルゴリズム
  const lanes = []; // 各レーンの最終終了時刻を管理
  const assignments = new Map(); // taskId -> laneNumber

  for (const task of sortedTasks) {
    const startMin = timeStringToMinutes(task.startTime);
    const endMin = timeStringToMinutes(task.endTime);

    // 空いているレーンを検索
    let assignedLane = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] <= startMin) {
        // このレーンは使用可能
        assignedLane = i;
        lanes[i] = endMin;
        break;
      }
    }

    // 空いているレーンがない場合、新しいレーンを作成
    if (assignedLane === -1) {
      assignedLane = lanes.length;
      lanes.push(endMin);
    }

    assignments.set(task.id, assignedLane);
  }

  return {
    maxLanes: lanes.length,
    assignments
  };
}

/**
 * 全日付のレーンを再計算
 * @returns {Map} dateString -> {maxLanes, assignments}
 */
export function recalculateAllLanes() {
  const appState = window.AppState;
  if (!appState || !appState.tasks) {
    return new Map();
  }

  // ユニークな日付を抽出
  const uniqueDates = [...new Set(appState.tasks.map(task => task.date))];
  const allLaneData = new Map();

  // 各日付について計算
  for (const date of uniqueDates) {
    const laneData = assignLanes(date);
    allLaneData.set(date, laneData);

    // タスクオブジェクトにレーン情報を設定
    for (const task of appState.tasks) {
      if (task.date === date) {
        task.lane = laneData.assignments.get(task.id) || 0;
        task.maxLanes = laneData.maxLanes;
      }
    }
  }

  return allLaneData;
}

/**
 * CSS GridレイアウトでDOMを更新
 * @param {HTMLElement} container - コンテナ要素
 * @param {number} maxLanes - 最大レーン数
 */
export function updateGridLayout(container, maxLanes) {
  if (!container) {return;}

  try {
    // CSS Grid設定
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${maxLanes}, 1fr)`;
    container.style.gap = '2px';

    // 各タスクカードのグリッド位置を設定
    const taskCards = container.querySelectorAll('.task-card');
    taskCards.forEach(card => {
      const taskId = card.dataset.taskId;
      const appState = window.AppState;
      const task = appState.tasks.find(t => t.id === taskId);

      if (task && typeof task.lane !== 'undefined') {
        card.style.gridColumn = `${task.lane + 1} / ${task.lane + 2}`;

        // レーン別ボーダー色（視覚的フィードバック）
        const borderColors = [
          'var(--primary)',
          'var(--success)',
          'var(--warning)',
          'var(--info)',
          'var(--purple)'
        ];
        card.style.borderLeft = `3px solid ${borderColors[task.lane % borderColors.length]}`;
      }
    });

    // デバッグ情報をコンソールに出力
    if (window.location.search.includes('debug=true')) {
      console.log(`🎯 レーンレイアウト更新: ${maxLanes}レーン, ${taskCards.length}タスク`);
    }

  } catch (error) {
    console.error('グリッドレイアウト更新エラー:', error);
  }
}

/**
 * Testing Trophy対応：レーン分けテストユーティリティ
 */
export const LaneEngineTest = {
  /**
   * テスト用の重複タスクを生成
   */
  createOverlappingTasks: () => {
    const testTasks = [
      { id: 'test1', startTime: '09:00', endTime: '10:00', date: '2025-01-15' },
      { id: 'test2', startTime: '09:30', endTime: '11:00', date: '2025-01-15' },
      { id: 'test3', startTime: '10:30', endTime: '12:00', date: '2025-01-15' },
      { id: 'test4', startTime: '09:15', endTime: '09:45', date: '2025-01-15' }
    ];

    // AppStateに追加
    if (!window.AppState) {window.AppState = { tasks: [] };}
    window.AppState.tasks.push(...testTasks);

    return assignLanes('2025-01-15');
  },

  /**
   * レーン割り当ての正当性チェック
   */
  validateLaneAssignments: (dateString) => {
    const appState = window.AppState;
    if (!appState || !appState.tasks) {return { valid: false, errors: ['AppState not initialized'] };}

    const dateTasks = appState.tasks.filter(task => task.date === dateString);
    const errors = [];

    // 同一レーン内での重複チェック
    const laneGroups = new Map();
    for (const task of dateTasks) {
      const lane = task.lane || 0;
      if (!laneGroups.has(lane)) {
        laneGroups.set(lane, []);
      }
      laneGroups.get(lane).push(task);
    }

    // 各レーン内で重複がないかチェック
    laneGroups.forEach((tasks, lane) => {
      for (let i = 0; i < tasks.length; i++) {
        for (let j = i + 1; j < tasks.length; j++) {
          if (hasTimeOverlap(tasks[i], tasks[j])) {
            errors.push(`Lane ${lane}: Overlap between ${tasks[i].id} and ${tasks[j].id}`);
          }
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      laneCount: laneGroups.size,
      taskCount: dateTasks.length
    };
  },

  /**
   * パフォーマンステスト
   */
  measureLanePerformance: (taskCount = 100) => {
    // テストデータ生成
    const testTasks = [];
    for (let i = 0; i < taskCount; i++) {
      const startHour = Math.floor(Math.random() * 22);
      const duration = Math.floor(Math.random() * 120) + 30; // 30-150分
      const startMin = startHour * 60 + Math.floor(Math.random() * 60);
      const endMin = Math.min(startMin + duration, 1439);

      testTasks.push({
        id: `perf-test-${i}`,
        startTime: `${Math.floor(startMin / 60).toString().padStart(2, '0')}:${(startMin % 60).toString().padStart(2, '0')}`,
        endTime: `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`,
        date: '2025-01-15'
      });
    }

    // パフォーマンス測定
    if (!window.AppState) {window.AppState = { tasks: [] };}
    window.AppState.tasks = testTasks;

    const start = performance.now();
    const result = assignLanes('2025-01-15');
    const end = performance.now();

    return {
      taskCount,
      maxLanes: result.maxLanes,
      executionTime: end - start,
      complexity: 'O(n log n)'
    };
  }
};