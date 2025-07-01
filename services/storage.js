/**
 * データ永続化サービス（Testing Trophy: Integration Level）
 * localStorage抽象化とTaskモデル定義
 *
 * @author t-wada推奨のClean Architecture
 */

import { timeStringToMinutes, getCurrentDateString } from '../core/timeUtils.js';

/**
 * Taskエンティティクラス - ドメインモデル
 */
export class Task {
  constructor(id, title, startTime, endTime, priority = 'normal', date = null) {
    this.id = id || this.generateId();
    this.title = title || '新しいタスク';
    this.startTime = startTime;
    this.endTime = endTime;
    this.priority = priority; // 'normal', 'high', 'urgent'
    this.completed = false;
    this.date = date || getCurrentDateString();

    // レーン分け用プロパティ（初期化時は未設定）
    this.lane = 0;
    this.maxLanes = 1;

    // バリデーション
    this.validate();
  }

  generateId() {
    return 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  validate() {
    if (!this.startTime || !this.endTime) {
      throw new Error('開始時刻と終了時刻は必須です');
    }

    try {
      const startMin = timeStringToMinutes(this.startTime);
      const endMin = timeStringToMinutes(this.endTime);

      // 日付跨ぎタスクの場合は特別に許可
      if (endMin <= startMin) {
        // 日付跨ぎかどうかの簡易チェック（23:00以降開始で翌日08:00以前終了など）
        const isLikelyOvernight = startMin >= 22 * 60 && endMin <= 8 * 60;
        if (!isLikelyOvernight) {
          throw new Error('終了時刻は開始時刻より後である必要があります（日付跨ぎの場合を除く）');
        }
      }
    } catch (error) {
      throw new Error('無効な時刻形式です: ' + error.message);
    }
  }

  getStartMinutes() {
    return timeStringToMinutes(this.startTime);
  }

  getEndMinutes() {
    return timeStringToMinutes(this.endTime);
  }

  getDurationMinutes() {
    return this.getEndMinutes() - this.getStartMinutes();
  }

  getTimeString() {
    return `${this.startTime} – ${this.endTime}`;
  }

  /**
   * 日付跨ぎタスクかどうか判定
   * @returns {boolean} 日付を跨ぐ場合true
   */
  isOvernight() {
    try {
      const startMin = this.getStartMinutes();
      const endMin = this.getEndMinutes();
      return endMin <= startMin; // 終了時刻が開始時刻以下の場合は翌日
    } catch (error) {
      console.error('日付跨ぎ判定エラー:', error);
      return false;
    }
  }

  /**
   * 日付跨ぎタスクを2つに分割
   * @returns {Object} { firstPart: Task, secondPart: Task }
   */
  splitIntoTwo() {
    if (!this.isOvernight()) {
      throw new Error('このタスクは日付を跨いでいません');
    }

    try {
      const startMin = this.getStartMinutes();
      const endMin = this.getEndMinutes();

      // 当日部分（開始時刻～23:59）
      const firstPart = new Task(
        this.id + '_part1',
        this.title,
        this.startTime,
        '23:59',
        this.priority,
        this.date
      );
      firstPart.completed = this.completed;
      firstPart.lane = this.lane;
      firstPart.maxLanes = this.maxLanes;

      // 翌日部分（00:00～終了時刻）
      const nextDate = new Date(this.date);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateString = nextDate.toISOString().split('T')[0];

      const secondPart = new Task(
        this.id + '_part2',
        this.title,
        '00:00',
        this.endTime,
        this.priority,
        nextDateString
      );
      secondPart.completed = this.completed;
      secondPart.lane = this.lane;
      secondPart.maxLanes = this.maxLanes;

      return { firstPart, secondPart };
    } catch (error) {
      console.error('タスク分割エラー:', error);
      throw error;
    }
  }

  /**
   * タスクを更新（不変性を保つ）
   */
  update(updates) {
    const newTask = new Task(
      this.id,
      updates.title ?? this.title,
      updates.startTime ?? this.startTime,
      updates.endTime ?? this.endTime,
      updates.priority ?? this.priority,
      updates.date ?? this.date
    );
    newTask.completed = updates.completed ?? this.completed;
    newTask.lane = this.lane;
    newTask.maxLanes = this.maxLanes;

    return newTask;
  }

  /**
   * JSONシリアライゼーション
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      startTime: this.startTime,
      endTime: this.endTime,
      priority: this.priority,
      completed: this.completed,
      date: this.date,
      lane: this.lane,
      maxLanes: this.maxLanes
    };
  }

  /**
   * JSONデシリアライゼーション
   */
  static fromJSON(json) {
    const task = new Task(
      json.id,
      json.title,
      json.startTime,
      json.endTime,
      json.priority,
      json.date
    );
    task.completed = json.completed || false;
    task.lane = json.lane || 0;
    task.maxLanes = json.maxLanes || 1;

    return task;
  }
}

/**
 * Storage Repository - データアクセス層
 */
export class StorageRepository {
  constructor(storageKey = 'nowtask-data') {
    this.storageKey = storageKey;
  }

  /**
   * 全タスクを保存
   */
  saveTasks(tasks) {
    try {
      const serializedTasks = tasks.map(task => task.toJSON());
      const data = {
        tasks: serializedTasks,
        version: '1.0',
        savedAt: new Date().toISOString()
      };

      localStorage.setItem(this.storageKey, JSON.stringify(data));

      // AppStateも同期
      if (window.AppState) {
        window.AppState.tasks = tasks;
      }

      return { success: true, taskCount: tasks.length };
    } catch (error) {
      console.error('タスク保存エラー:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 全タスクを読み込み
   */
  loadTasks() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) {
        return { success: true, tasks: [], isFirstTime: true };
      }

      const data = JSON.parse(stored);
      const tasks = data.tasks.map(json => Task.fromJSON(json));

      // AppStateに設定
      if (!window.AppState) {
        window.AppState = {};
      }
      window.AppState.tasks = tasks;

      return {
        success: true,
        tasks,
        version: data.version,
        savedAt: data.savedAt,
        isFirstTime: false
      };
    } catch (error) {
      console.error('タスク読み込みエラー:', error);
      return { success: false, error: error.message, tasks: [] };
    }
  }

  /**
   * ストレージをクリア
   */
  clearStorage() {
    try {
      localStorage.removeItem(this.storageKey);
      if (window.AppState) {
        window.AppState.tasks = [];
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ストレージサイズを取得
   */
  getStorageInfo() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      const sizeInBytes = stored ? new Blob([stored]).size : 0;
      const sizeInKB = (sizeInBytes / 1024).toFixed(2);

      return {
        sizeInBytes,
        sizeInKB,
        exists: !!stored
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

/**
 * デフォルトのStorageRepositoryインスタンス
 */
const defaultRepository = new StorageRepository();

/**
 * 高レベルAPI（後方互換性のため）
 */
export function saveToStorage() {
  const appState = window.AppState;
  if (!appState || !appState.tasks) {
    console.warn('AppState not initialized');
    return { success: false };
  }

  return defaultRepository.saveTasks(appState.tasks);
}

export function loadFromStorage() {
  const result = defaultRepository.loadTasks();

  if (result.isFirstTime) {
    // 初回起動時はダミーデータを初期化
    initializeDummyData();
  }

  return result;
}

/**
 * ダミーデータ初期化（デモ用）
 */
export function initializeDummyData() {
  const today = getCurrentDateString();

  const dummyTasks = [
    new Task(null, '朝の準備', '07:00', '08:00', 'normal', today),
    new Task(null, 'プレゼン資料作成', '09:00', '11:30', 'high', today),
    new Task(null, 'ランチミーティング', '12:00', '13:00', 'normal', today),
    new Task(null, '緊急対応', '14:00', '15:30', 'urgent', today)
  ];

  // AppStateに設定
  if (!window.AppState) {
    window.AppState = {};
  }
  window.AppState.tasks = dummyTasks;

  // 保存
  const result = defaultRepository.saveTasks(dummyTasks);

  console.log('📝 ダミーデータ初期化完了:', result);
  return dummyTasks;
}

/**
 * Testing Trophy対応：ストレージテストユーティリティ
 */
export const StorageTest = {
  /**
   * テスト用のRepositoryインスタンス作成
   */
  createTestRepository: (storageKey = 'test-nowtask') => {
    return new StorageRepository(storageKey);
  },

  /**
   * テスト用タスクデータ生成
   */
  generateTestTasks: (count = 5) => {
    const tasks = [];
    const today = getCurrentDateString();

    for (let i = 0; i < count; i++) {
      const startHour = 8 + i;
      const endHour = startHour + 1;

      tasks.push(new Task(
        null,
        `テストタスク${i + 1}`,
        `${startHour.toString().padStart(2, '0')}:00`,
        `${endHour.toString().padStart(2, '0')}:00`,
        ['normal', 'high', 'urgent'][i % 3],
        today
      ));
    }

    return tasks;
  },

  /**
   * ストレージのデータ整合性テスト
   */
  testDataIntegrity: () => {
    const testRepo = new StorageRepository('integrity-test');
    const originalTasks = StorageTest.generateTestTasks(3);

    // 保存
    const saveResult = testRepo.saveTasks(originalTasks);
    if (!saveResult.success) {
      return { passed: false, error: 'Save failed' };
    }

    // 読み込み
    const loadResult = testRepo.loadTasks();
    if (!loadResult.success) {
      return { passed: false, error: 'Load failed' };
    }

    // 比較
    const loadedTasks = loadResult.tasks;
    if (loadedTasks.length !== originalTasks.length) {
      return { passed: false, error: 'Task count mismatch' };
    }

    for (let i = 0; i < originalTasks.length; i++) {
      const original = originalTasks[i];
      const loaded = loadedTasks[i];

      if (original.title !== loaded.title ||
          original.startTime !== loaded.startTime ||
          original.endTime !== loaded.endTime) {
        return { passed: false, error: `Task ${i} data mismatch` };
      }
    }

    // クリーンアップ
    testRepo.clearStorage();

    return { passed: true, testedTasks: originalTasks.length };
  },

  /**
   * パフォーマンステスト
   */
  measureStoragePerformance: (taskCount = 1000) => {
    const testRepo = new StorageRepository('perf-test');
    const testTasks = StorageTest.generateTestTasks(taskCount);

    // 保存パフォーマンス
    const saveStart = performance.now();
    const saveResult = testRepo.saveTasks(testTasks);
    const saveTime = performance.now() - saveStart;

    // 読み込みパフォーマンス
    const loadStart = performance.now();
    const loadResult = testRepo.loadTasks();
    const loadTime = performance.now() - loadStart;

    // クリーンアップ
    testRepo.clearStorage();

    return {
      taskCount,
      saveTime: saveTime.toFixed(2) + 'ms',
      loadTime: loadTime.toFixed(2) + 'ms',
      storageSize: JSON.stringify(testTasks).length + ' bytes'
    };
  }
};