import { getInitialDate } from './core/dateUtils.js';

// --- グローバル状態管理 ---
window.AppState = {
  tasks: [],
  lanes: {},
  currentDate: getInitialDate(window.location, window.localStorage),
  // ... 他の状態
};

// --- アプリケーションの初期化 ---
// ブラウザ環境でのみ実行
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // 初期化処理をここに記述
  });
}

// テスト用にエクスポート（必要な場合）
// export { ... };

