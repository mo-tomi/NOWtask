# NowTask - パーソナルタスクマネージャー

[![pnpm](https://img.shields.io/badge/pnpm-v8.15.0-orange)](https://pnpm.io/)
[![Vite](https://img.shields.io/badge/Vite-v5.0.0-646CFF)](https://vitejs.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-v1.0.0-6E9F18)](https://vitest.dev/)
[![Rolldown](https://img.shields.io/badge/Rolldown-v0.5.0-FF6B35)](https://rolldown.rs/)

1日の予定を縦型タイムラインで可視化するパーソナルタスクマネージャーです。

## 🚀 特徴

- **1分=1px**の正確なタイムライン表示
- **日付跨ぎタスク**の自動分割表示（23:00-07:00 → 2枚のカード）
- **レーン分け**による重複タスクの自動配置
- **無限スクロール**対応の仮想化DOM
- **Testing Trophy**準拠のテスト設計
- **Clean Architecture**によるモジュラー設計

## 🛠️ 技術スタック

- **Build Tool**: Vite 5.0 + Rolldown 0.5
- **Package Manager**: pnpm 8.15
- **Testing**: Vitest 1.0 + jsdom
- **Language**: Vanilla JavaScript (ES2022)
- **Styling**: Vanilla CSS (フレームワーク不使用)

## 📋 前提条件

- Node.js 18.0.0 以上
- pnpm 8.0.0 以上

## 🚦 クイックスタート

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 開発サーバー起動

```bash
pnpm dev
```

→ http://localhost:8000 でアプリケーションが起動します

### 3. ビルド

```bash
pnpm build
```

### 4. プレビュー

```bash
pnpm preview
```

## 🧪 テスト実行

### 単体テスト実行

```bash
pnpm test
```

### テスト（ワンショット）

```bash
pnpm test:run
```

### テストUI

```bash
pnpm test:ui
```

### カバレッジ測定

```bash
pnpm test:coverage
```

## 📁 プロジェクト構成

```
NOWtask/
├── core/                    # コアロジック（Unit Level）
│   ├── timeUtils.js        # 時間計算ユーティリティ
│   └── laneEngine.js       # レーン分けアルゴリズム
├── services/               # サービス層（Integration Level）
│   └── storage.js          # データ永続化・Taskモデル
├── ui/                     # UI層（Integration Level）
│   ├── taskCard.js         # タスクカード管理
│   └── virtualScroll.js    # 無限スクロール
├── test/                   # テスト設定
│   └── setup.js           # Vitestセットアップ
├── index.html              # メインHTML
├── style.css               # 全スタイル定義
├── main.js                 # エントリーポイント
├── vite.config.js          # Vite設定
├── package.json            # プロジェクト設定
├── pnpm-workspace.yaml     # pnpmワークスペース
├── task-overnight.test.js  # 日付跨ぎテスト
└── README.md               # このファイル
```

## 🏗️ アーキテクチャ

### Testing Trophy準拠

```
    /\      E2E Tests (少数)
   /  \     Integration Tests (中程度)
  /____\    Unit Tests (多数)
 /______\   Static Analysis
```

- **Unit Level**: `core/timeUtils.js`, `core/laneEngine.js`
- **Integration Level**: `services/storage.js`, `ui/taskCard.js`, `ui/virtualScroll.js`
- **E2E Level**: `main.js`の統合テスト

### Clean Architecture

```
┌─────────────────────────────────────┐
│              UI Layer               │  ui/
├─────────────────────────────────────┤
│           Services Layer            │  services/
├─────────────────────────────────────┤
│             Core Layer              │  core/
└─────────────────────────────────────┘
```

## 🌟 主要機能

### 1. 日付跨ぎタスク分割

```javascript
// 23:00-07:00 のタスクは自動的に2枚に分割
const task = new Task(null, '夜勤', '23:00', '07:00');
if (task.isOvernight()) {
  const { firstPart, secondPart } = task.splitIntoTwo();
  // firstPart: 23:00-23:59 (当日)
  // secondPart: 00:00-07:00 (翌日)
}
```

### 2. O(n log n) レーン分けアルゴリズム

```javascript
// 重複するタスクを自動的に横並びに配置
const laneData = assignLanes('2025-01-15');
// → { maxLanes: 3, assignments: Map<taskId, laneNumber> }
```

### 3. 仮想化DOM（無限スクロール）

```javascript
// 前後1日分のみDOMに保持、メモリ効率化
ensureVisibleDays('2025-01-15');
// → 前日・当日・翌日の3パネルのみレンダリング
```

## 🎮 使用方法

### デバッグモード有効化

```
http://localhost:8000?debug=true
```

### 📚 重要な設計原則

**キーボードショートカット不使用ポリシー**
- このアプリケーションは意図的にキーボードショートカットを実装しません
- シンプルさとユーザビリティを重視し、マウス/タッチ操作のみに特化
- 集中を妨げる複雑な操作は避け、直感的なUIを優先

**ダークモード不実装ポリシー**
- このアプリケーションは意図的にダークモードを実装しません
- 統一された美しいライトテーマに特化し、一貫したUXを提供
- テーマ切り替えによる複雑性を排除し、洗練されたデザインを追求

### 日付跨ぎサンプル生成

```javascript
// ブラウザコンソールで実行
NowTaskTest.testLaneManagement.createOvernightSample()
// → 22:00-02:00 と 23:30-08:00 のサンプルタスクを生成
```

### テストAPI活用

```javascript
// 時間計算テスト
NowTaskTest.timeUtils.measurePerformance(() => {
  timeStringToMinutes('14:30');
});

// レーン分けテスト
NowTaskTest.laneEngine.createOverlappingTasks();

// タスク生成テスト
NowTaskTest.testLaneManagement.checkOvernightDisplay(taskId);
```

## 🔧 開発ガイド

### コーディング規約

- **JavaScript**: ECMAScript 2021、インデント2スペース
- **CSS**: Vanilla CSS、BEM記法不使用
- **HTML**: セマンティックタグ優先

### ファイル命名規則

- **関数**: camelCase (`createTaskCard`)
- **クラス**: PascalCase (`Task`)
- **定数**: UPPER_SNAKE_CASE (`MAX_LANES`)
- **ファイル**: kebab-case (`task-card.js`)

### Git運用

```bash
# 機能ブランチ作成
git checkout -b feature/overnight-tasks

# コミット
git commit -m "feat: 日付跨ぎタスクの分割表示機能を追加"

# プッシュ
git push origin feature/overnight-tasks
```

## 🐛 トラブルシューティング

### よくある問題

1. **pnpm install で失敗する**
   ```bash
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   ```

2. **テストが失敗する**
   ```bash
   pnpm test:run --reporter=verbose
   ```

3. **ビルドエラー**
   ```bash
   pnpm clean && pnpm build
   ```

### デバッグ方法

```javascript
// ブラウザコンソールで状態確認
console.log(window.AppState);
console.log(window.NowTaskTest);

// パフォーマンス計測
NowTaskTest.integration.measureFullRenderTime();
```

## 📈 パフォーマンス

- **初期読み込み**: < 1秒
- **300件タスクレンダリング**: < 100ms
- **FPS**: 60fps 維持
- **メモリ使用量**: 仮想化により最小限

## 🔮 今後の予定

- [ ] PWA対応
- [ ] オフライン機能
- [ ] データエクスポート
- [ ] カレンダー連携
- [ ] AI予定提案

## 🤝 コントリビューション

1. Fork this repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 ライセンス

MIT License

## 👨‍💻 作者

**TOMI** - [GitHub](https://github.com/your-username)

---

**🌙 日付跨ぎタスクも美しく表示する、次世代タスクマネージャー** 