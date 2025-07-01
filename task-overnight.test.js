/**
 * Task クラス日付跨ぎ機能のユニットテスト
 * Vitest用テストケース
 *
 * @author Testing Trophy準拠
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Task } from './services/storage.js';
import { resetAppState } from './test/setup.js';

describe('Task 日付跨ぎ機能', () => {
  describe('isOvernight()', () => {
    test('通常のタスク（同日内）は false を返す', () => {
      const task = new Task(null, 'テスト', '09:00', '17:00', 'normal', '2025-01-15');
      expect(task.isOvernight()).toBe(false);
    });

    test('日付跨ぎタスク（23:00-07:00）は true を返す', () => {
      const task = new Task(null, 'テスト', '23:00', '07:00', 'normal', '2025-01-15');
      expect(task.isOvernight()).toBe(true);
    });

    test('深夜跨ぎタスク（22:30-02:30）は true を返す', () => {
      const task = new Task(null, 'テスト', '22:30', '02:30', 'normal', '2025-01-15');
      expect(task.isOvernight()).toBe(true);
    });

    test('境界値：23:59-00:00 は true を返す', () => {
      const task = new Task(null, 'テスト', '23:59', '00:00', 'normal', '2025-01-15');
      expect(task.isOvernight()).toBe(true);
    });

    test('エラー時は false を返す', () => {
      // コンストラクタではなく、valid なタスクを作成してから無効な時刻に変更
      const task = new Task(null, 'テスト', '09:00', '17:00', 'normal', '2025-01-15');
      // プロパティを直接変更してisOvernight()のエラーハンドリングをテスト
      task.startTime = 'invalid';
      expect(task.isOvernight()).toBe(false);
    });
  });

  describe('splitIntoTwo()', () => {
    test('23:00-07:00 タスクを正しく分割する', () => {
      const task = new Task(null, '夜勤シフト', '23:00', '07:00', 'high', '2025-01-15');
      const { firstPart, secondPart } = task.splitIntoTwo();

      // 当日部分
      expect(firstPart.title).toBe('夜勤シフト');
      expect(firstPart.startTime).toBe('23:00');
      expect(firstPart.endTime).toBe('23:59');
      expect(firstPart.date).toBe('2025-01-15');
      expect(firstPart.priority).toBe('high');
      expect(firstPart.id).toContain('_part1');

      // 翌日部分
      expect(secondPart.title).toBe('夜勤シフト');
      expect(secondPart.startTime).toBe('00:00');
      expect(secondPart.endTime).toBe('07:00');
      expect(secondPart.date).toBe('2025-01-16');
      expect(secondPart.priority).toBe('high');
      expect(secondPart.id).toContain('_part2');
    });

    test('22:00-02:00 タスクを正しく分割する', () => {
      const task = new Task(null, '深夜作業', '22:00', '02:00', 'urgent', '2025-01-15');
      const { firstPart, secondPart } = task.splitIntoTwo();

      expect(firstPart.startTime).toBe('22:00');
      expect(firstPart.endTime).toBe('23:59');
      expect(firstPart.date).toBe('2025-01-15');

      expect(secondPart.startTime).toBe('00:00');
      expect(secondPart.endTime).toBe('02:00');
      expect(secondPart.date).toBe('2025-01-16');
    });

    test('完了状態とレーン情報も引き継がれる', () => {
      const task = new Task(null, 'テスト', '23:30', '08:00', 'normal', '2025-01-15');
      task.completed = true;
      task.lane = 2;
      task.maxLanes = 3;

      const { firstPart, secondPart } = task.splitIntoTwo();

      expect(firstPart.completed).toBe(true);
      expect(firstPart.lane).toBe(2);
      expect(firstPart.maxLanes).toBe(3);

      expect(secondPart.completed).toBe(true);
      expect(secondPart.lane).toBe(2);
      expect(secondPart.maxLanes).toBe(3);
    });

    test('月末日付跨ぎも正しく処理される', () => {
      const task = new Task(null, 'テスト', '23:00', '06:00', 'normal', '2025-01-31');
      const { firstPart, secondPart } = task.splitIntoTwo();

      expect(firstPart.date).toBe('2025-01-31');
      expect(secondPart.date).toBe('2025-02-01');
    });

    test('2月末から3月への跨ぎ（平年）', () => {
      const task = new Task(null, 'テスト', '23:00', '06:00', 'normal', '2025-02-28');
      const { firstPart, secondPart } = task.splitIntoTwo();

      expect(firstPart.date).toBe('2025-02-28');
      expect(secondPart.date).toBe('2025-03-01');
    });

    test('通常タスクで呼び出すとエラーが発生する', () => {
      const task = new Task(null, 'テスト', '09:00', '17:00', 'normal', '2025-01-15');

      expect(() => {
        task.splitIntoTwo();
      }).toThrow('このタスクは日付を跨いでいません');
    });
  });

  describe('統合テスト', () => {
    test('分割されたタスクの時間継続性', () => {
      const task = new Task(null, 'テスト', '22:30', '07:30', 'normal', '2025-01-15');
      const { firstPart, secondPart } = task.splitIntoTwo();

      // 当日部分の長さ：22:30-23:59 = 89分
      const firstDuration = firstPart.getDurationMinutes();
      expect(firstDuration).toBe(89);

      // 翌日部分の長さ：00:00-07:30 = 450分
      const secondDuration = secondPart.getDurationMinutes();
      expect(secondDuration).toBe(450);

      // 合計：89 + 450 = 539分（23:59と00:00の1分間の隙間があるため）
      expect(firstDuration + secondDuration).toBe(539);
    });

    test('IDの一意性確保', () => {
      const task1 = new Task(null, 'タスク1', '23:00', '07:00', 'normal', '2025-01-15');
      const task2 = new Task(null, 'タスク2', '23:00', '07:00', 'normal', '2025-01-15');

      const split1 = task1.splitIntoTwo();
      const split2 = task2.splitIntoTwo();

      // 各分割タスクのIDは一意である
      const allIds = [
        split1.firstPart.id,
        split1.secondPart.id,
        split2.firstPart.id,
        split2.secondPart.id
      ];

      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(4);
    });
  });
});

// テスト間のデータリセット
beforeEach(() => {
  // AppStateとローカルストレージのリセット（setup.jsで自動実行）
  resetAppState();
});