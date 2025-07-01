/**
 * Vitest セットアップファイル
 * Testing Trophy準拠のテスト環境設定
 *
 * @author Kent C. Dodds Testing Trophy
 */

import { vi } from 'vitest';

// ===== DOM環境のモック設定 =====

// localStorage のモック
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// sessionStorage のモック
Object.defineProperty(window, 'sessionStorage', {
  value: localStorageMock
});

// location.search のモック
Object.defineProperty(window, 'location', {
  value: {
    search: '?debug=true',
    href: 'http://localhost:8000/',
    origin: 'http://localhost:8000',
    pathname: '/',
    hash: ''
  },
  writable: true
});

// IntersectionObserver のモック
global.IntersectionObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '',
  thresholds: []
}));

// ResizeObserver のモック
global.ResizeObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

// requestAnimationFrame のモック
global.requestAnimationFrame = vi.fn().mockImplementation((callback) => {
  return setTimeout(callback, 16); // 約60fps
});

global.cancelAnimationFrame = vi.fn().mockImplementation((id) => {
  clearTimeout(id);
});

// performance.now のモック
Object.defineProperty(global, 'performance', {
  value: {
    now: vi.fn(() => Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByName: vi.fn(() => []),
    getEntriesByType: vi.fn(() => [])
  }
});

// Date のモック（テスト時の一貫性確保）
const MOCK_DATE = new Date('2025-01-15T12:00:00.000Z');

vi.setSystemTime(MOCK_DATE);

// ===== グローバル変数の初期化 =====

// AppState の初期化
global.AppState = {
  tasks: [],
  currentDate: '2025-01-15',
  debugMode: true,
  performance: {
    initStartTime: performance.now(),
    lastRenderTime: 0,
    taskCount: 0
  }
};

// ===== コンソール出力の制御 =====

// テスト実行時の不要なログを抑制
const originalConsole = { ...console };

// エラーレベル以上のみ表示
console.log = vi.fn();
console.info = vi.fn();
console.warn = vi.fn();
console.error = originalConsole.error;

// ===== テスト共通ユーティリティ =====

/**
 * DOMクリーンアップヘルパー
 */
export function cleanupDOM() {
  document.body.innerHTML = '';
  document.head.innerHTML = '<title>Test</title>';
}

/**
 * AppState リセットヘルパー
 */
export function resetAppState() {
  global.AppState = {
    tasks: [],
    currentDate: '2025-01-15',
    debugMode: true,
    performance: {
      initStartTime: performance.now(),
      lastRenderTime: 0,
      taskCount: 0
    }
  };
}

/**
 * localStorage リセットヘルパー
 */
export function resetLocalStorage() {
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
}

// ===== ライフサイクルフック =====

// 各テスト前のクリーンアップ
beforeEach(() => {
  cleanupDOM();
  resetAppState();
  resetLocalStorage();
  vi.clearAllTimers();
  vi.clearAllMocks();
});

// 各テスト後のクリーンアップ
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
});

// テストスイート終了後のクリーンアップ
afterAll(() => {
  vi.restoreAllMocks();
  Object.assign(console, originalConsole);
});