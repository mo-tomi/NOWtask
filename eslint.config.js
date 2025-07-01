import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        requestIdleCallback: 'readonly',
        Worker: 'readonly',
        URL: 'readonly',
        location: 'readonly',
        history: 'readonly',
        IntersectionObserver: 'readonly',
        addEventListener: 'readonly',
        removeEventListener: 'readonly',
        // Timer functions
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Browser APIs
        localStorage: 'readonly',
        confirm: 'readonly',
        getComputedStyle: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        MouseEvent: 'readonly',
        // Web Worker
        self: 'readonly',
        // Testing globals
        global: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        afterAll: 'readonly',
        // Node.js
        process: 'readonly'
      }
    },
    rules: {
      // 重複検出の強化
      'no-duplicate-imports': 'error',
      'no-redeclare': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',

      // 未使用変数・関数の検出
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],

      // コードクリーンアップ
      'no-unreachable': 'error',
      'no-unused-expressions': 'warn',
      'no-useless-return': 'error',
      'no-useless-concat': 'error',
      'no-inner-declarations': 'error',

      // コードスタイル
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': 'error',
      'curly': 'error',
      'no-multi-spaces': 'error',
      'no-trailing-spaces': 'error',

      // パフォーマンス関連
      'no-loop-func': 'warn',

      // その他
      'no-console': 'off'
    }
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'src/**' // SCSSファイルがあるため
    ]
  }
];