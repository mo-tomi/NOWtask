/**
 * 時間計算ユーティリティ（Testing Trophy: Unit Level）
 * 純粋関数のみ、副作用なし、テスト容易性を最優先
 *
 * @author t-wada推奨のテスタブル設計
 */

/**
 * 時刻文字列（HH:MM）を分に変換
 * @param {string} str - "08:30" 形式の時刻文字列
 * @returns {number} 0:00からの経過分数
 */
export function timeStringToMinutes(str) {
  if (typeof str !== 'string' || !str.includes(':')) {
    throw new Error('Invalid time format. Expected "HH:MM"');
  }

  const [hours, minutes] = str.split(':').map(Number);

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Invalid time values');
  }

  return hours * 60 + minutes;
}

/**
 * 分を時刻文字列（HH:MM）に変換
 * @param {number} min - 0:00からの経過分数
 * @returns {string} "HH:MM" 形式の時刻文字列
 */
export function minutesToTimeString(min) {
  if (typeof min !== 'number' || min < 0 || min >= 1440) {
    throw new Error('Invalid minutes. Expected 0-1439');
  }

  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * 分を15分単位にスナップ
 * @param {number} min - 元の分数
 * @returns {number} 15分単位に丸めた分数
 */
export function snap15(min) {
  if (typeof min !== 'number') {
    throw new Error('Invalid input. Expected number');
  }

  return Math.round(min / 15) * 15;
}

/**
 * 時間範囲の妥当性チェック
 * @param {string} startTime - 開始時刻 "HH:MM"
 * @param {string} endTime - 終了時刻 "HH:MM"
 * @returns {boolean} 妥当性
 */
export function isValidTimeRange(startTime, endTime) {
  try {
    const startMin = timeStringToMinutes(startTime);
    const endMin = timeStringToMinutes(endTime);
    return endMin > startMin;
  } catch (error) {
    return false;
  }
}

/**
 * 日付文字列操作の純粋関数
 */
export function getNextDate(dateString) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
}

export function getPrevDate(dateString) {
  const date = new Date(dateString);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

export function getDayOfWeek(dateString) {
  const date = new Date(dateString);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[date.getDay()];
}

export function getCurrentDateString() {
  return new Date().toISOString().split('T')[0];
}

export function formatDateForDisplay(dateString) {
  const date = new Date(dateString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = getDayOfWeek(dateString);
  return `${month}/${day}(${dayOfWeek})`;
}

/**
 * Testing Trophy対応：テストヘルパー関数
 */
export const TimeUtilsTest = {
  // 境界値テスト用
  getBoundaryValues: () => ({
    minTime: "00:00",
    maxTime: "23:59",
    midTime: "12:00",
    minMinutes: 0,
    maxMinutes: 1439
  }),

  // ランダムテストデータ生成
  generateRandomTime: () => {
    const hours = Math.floor(Math.random() * 24);
    const minutes = Math.floor(Math.random() * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  },

  // パフォーマンステスト
  measurePerformance: (fn, iterations = 10000) => {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const end = performance.now();
    return end - start;
  }
};