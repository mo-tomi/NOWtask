/**
 * @fileoverview 日付関連のユーティリティ関数
 * DOMやアプリケーションの状態に依存しない純粋な関数群。
 */

/**
 * 'YYYY-MM-DD' 形式の現在日付を取得する
 * @returns {string}
 */
export function getCurrentDateString() {
  return new Date().toLocaleDateString('sv-SE');
}

/**
 * 指定された日付が今日または未来であるかを確認する
 * @param {string} dateString - 'YYYY-MM-DD' 形式の日付文字列
 * @returns {boolean}
 */
export function isTodayOrFuture(dateString) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateString);
    return date >= today;
  } catch (error) {
    console.error('日付チェックエラー:', error);
    return false;
  }
}

/**
 * アプリケーションの初期表示日付を決定する
 * 優先順位: URLパラメータ > localStorage > 今日
 * @param {object} location - window.location オブジェクト
 * @param {object} storage - localStorage オブジェクト
 * @returns {string} - 'YYYY-MM-DD' 形式の日付
 */
export function getInitialDate(location, storage) {
  // 1. URLパラメータから取得
  try {
    const urlParams = new URLSearchParams(location.search);
    const dateFromURL = urlParams.get('date');
    if (dateFromURL && /^\d{4}-\d{2}-\d{2}$/.test(dateFromURL)) {
      const d = new Date(dateFromURL);
      if (d.toISOString().slice(0, 10) === dateFromURL) {
        return dateFromURL;
      }
    }
  } catch (e) {
    // URLSearchParamsが使えない環境など
  }

  // 2. ローカルストレージから取得
  const lastDate = storage.getItem('lastDate');
  if (lastDate && isTodayOrFuture(lastDate)) {
    return lastDate;
  }

  // 3. デフォルトは今日
  return getCurrentDateString();
} 