import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getInitialDate, getCurrentDateString, isTodayOrFuture } from '../core/dateUtils.js';

// JSDOM 環境での localStorage のモック
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('getInitialDate - URLパラメータとストレージの優先順位テスト', () => {
  const today = getCurrentDateString();
  let mockLocation;

  beforeEach(() => {
    localStorage.clear();
    mockLocation = { search: '' };
    vi.spyOn(Date, 'now').mockImplementation(() => new Date(today + 'T12:00:00').getTime());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Test Cases ---

  it('1. URLパラメータに有効な日付がある場合、その日付を最優先で返す', () => {
    mockLocation.search = '?date=2025-10-20';
    localStorage.setItem('lastDate', '2025-10-25');
    expect(getInitialDate(mockLocation, localStorage)).toBe('2025-10-20');
  });

  it('2. URLパラメータがなく、localStorageに有効な未来の日付がある場合、その日付を返す', () => {
    const futureDate = '2099-12-31';
    localStorage.setItem('lastDate', futureDate);
    expect(isTodayOrFuture(futureDate)).toBe(true);
    expect(getInitialDate(mockLocation, localStorage)).toBe(futureDate);
  });
  
  it('3. URLパラメータがなく、localStorageに過去の日付がある場合、今日の日付を返す', () => {
    localStorage.setItem('lastDate', '2000-01-01');
    expect(getInitialDate(mockLocation, localStorage)).toBe(today);
  });

  it('4. URLパラメータもlocalStorageもない場合、今日の日付を返す', () => {
    expect(getInitialDate(mockLocation, localStorage)).toBe(today);
  });
  
  it('5. URLパラメータの日付フォーマットが不正な場合、無視してlocalStorageの日付を返す', () => {
    mockLocation.search = '?date=2025/10/20';
    localStorage.setItem('lastDate', '2025-10-25');
    expect(getInitialDate(mockLocation, localStorage)).toBe('2025-10-25');
  });
  
  it('6. URLパラメータの日付フォーマットが不正で、localStorageもない場合、今日の日付を返す', () => {
    mockLocation.search = '?date=not-a-date';
    expect(getInitialDate(mockLocation, localStorage)).toBe(today);
  });

  it('7. URLパラメータの日付が存在しない日付の場合(例:2月30日)、無視して今日の日付を返す', () => {
    mockLocation.search = '?date=2025-02-30';
    expect(getInitialDate(mockLocation, localStorage)).toBe(today);
  });

  it('8. うるう年(2月29日)がURLパラメータで正しく扱われる', () => {
    mockLocation.search = '?date=2024-02-29';
    expect(getInitialDate(mockLocation, localStorage)).toBe('2024-02-29');
  });

  it('9. うるう年でない年の2月29日は無効な日付として扱われる', () => {
    mockLocation.search = '?date=2025-02-29';
    expect(getInitialDate(mockLocation, localStorage)).toBe(today);
  });

  it('10. 空のdateパラメータは無視され、localStorageの値が使われる', () => {
    mockLocation.search = '?date=';
    localStorage.setItem('lastDate', '2025-11-11');
    expect(getInitialDate(mockLocation, localStorage)).toBe('2025-11-11');
  });
}); 