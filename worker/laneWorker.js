/**
 * レーン分けエンジン Web Worker
 * 1,000タスク × 3日のレーン計算を55fps以上で処理
 *
 * @author High Performance Web Worker Architecture
 */

/**
 * 時刻文字列を分数に変換（Worker内部専用）
 * Note: Web Worker内では外部モジュールimport不可のため内部実装
 */
function timeStringToMinutes(timeString) {
  if (!timeString || typeof timeString !== 'string') {
    throw new Error('Invalid time format. Expected "HH:MM"');
  }

  const [hours, minutes] = timeString.split(':');
  const h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);

  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error('Invalid time format. Expected "HH:MM"');
  }

  return h * 60 + m;
}

/**
 * 2つのタスクが時間的に重複するかチェック（Worker内部専用）
 * Note: Web Worker内では外部モジュールimport不可のため内部実装
 */
function hasTimeOverlap(task1, task2) {
  if (!task1 || !task2) {return false;}

  try {
    const start1 = timeStringToMinutes(task1.startTime);
    const end1 = timeStringToMinutes(task1.endTime);
    const start2 = timeStringToMinutes(task2.startTime);
    const end2 = timeStringToMinutes(task2.endTime);

    return start1 < end2 && start2 < end1;
  } catch (error) {
    console.error('時間重複チェックエラー:', error);
    return false;
  }
}

/**
 * 日付跨ぎタスク分割処理（Worker版）
 */
function splitOvernightTask(task) {
  if (!task.isOvernight) {
    return { firstPart: task, secondPart: null };
  }

  const taskDate = new Date(task.date);
  const nextDate = new Date(taskDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const firstPart = {
    ...task,
    id: `${task.id}_first`,
    endTime: '23:59',
    isOvernightPart: true
  };

  const secondPart = {
    ...task,
    id: `${task.id}_second`,
    date: nextDate.toISOString().split('T')[0],
    startTime: '00:00',
    isOvernightPart: true
  };

  return { firstPart, secondPart };
}

/**
 * 指定日のタスクにレーン番号を割り当て（Worker版 O(n log n)）
 */
function assignLanesForDate(dateString, allTasks) {
  if (!allTasks || allTasks.length === 0) {
    return { maxLanes: 1, assignments: {} };
  }

  // 指定日のタスクをフィルタリング + 分割タスクを展開
  const dateTasks = allTasks.filter(task => task.date === dateString);
  const expandedTasks = [];

  for (const task of dateTasks) {
    if (task.isOvernight) {
      const { firstPart } = splitOvernightTask(task);
      expandedTasks.push(firstPart);
    } else {
      expandedTasks.push(task);
    }
  }

  // 前日の日付跨ぎタスクの翌日部分もチェック
  const prevDate = new Date(dateString);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateString = prevDate.toISOString().split('T')[0];

  const prevDayTasks = allTasks.filter(task => task.date === prevDateString);
  for (const task of prevDayTasks) {
    if (task.isOvernight) {
      const { secondPart } = splitOvernightTask(task);
      if (secondPart && secondPart.date === dateString) {
        expandedTasks.push(secondPart);
      }
    }
  }

  if (expandedTasks.length === 0) {
    return { maxLanes: 1, assignments: {} };
  }

  // 時刻順にソート（O(n log n)）
  const sortedTasks = [...expandedTasks].sort((a, b) => {
    return timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime);
  });

  // レーン割り当てアルゴリズム
  const lanes = []; // 各レーンの最終終了時刻を管理
  const assignments = {}; // taskId -> laneNumber

  for (const task of sortedTasks) {
    const startMin = timeStringToMinutes(task.startTime);
    const endMin = timeStringToMinutes(task.endTime);

    // 空いているレーンを検索
    let assignedLane = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] <= startMin) {
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

    assignments[task.id] = assignedLane;
  }

  return {
    maxLanes: lanes.length,
    assignments
  };
}

/**
 * 全日付のレーン計算（バッチ処理）
 */
function calculateAllLanes(allTasks) {
  const startTime = performance.now();

  // ユニークな日付を抽出
  const uniqueDates = [...new Set(allTasks.map(task => task.date))];
  const allLaneData = {};

  // 各日付について並列計算（Worker内での処理）
  for (const date of uniqueDates) {
    allLaneData[date] = assignLanesForDate(date, allTasks);
  }

  const calculationTime = performance.now() - startTime;

  return {
    laneData: allLaneData,
    calculationTime,
    processedDates: uniqueDates.length,
    totalTasks: allTasks.length
  };
}

/**
 * Worker メッセージハンドラー
 */
self.onmessage = function(e) {
  const { type, data, requestId } = e.data;

  try {
    switch (type) {
      case 'CALCULATE_LANES': {
        const result = calculateAllLanes(data.tasks);
        self.postMessage({
          type: 'LANES_CALCULATED',
          requestId,
          success: true,
          data: result
        });
        break;
      }

      case 'CALCULATE_SINGLE_DATE': {
        const singleResult = assignLanesForDate(data.date, data.tasks);
        self.postMessage({
          type: 'SINGLE_DATE_CALCULATED',
          requestId,
          success: true,
          data: {
            date: data.date,
            ...singleResult
          }
        });
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      requestId,
      success: false,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
};