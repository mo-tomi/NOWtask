/**
 * Vite設定 with Rolldown
 * NowTask プロジェクト用設定
 *
 * @author Testing Trophy + Clean Architecture
 */

import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],

  // 開発サーバー設定
  server: {
    port: 8000,
    host: true,
    open: true,
    cors: true,
  },

  // 実験的機能: Rolldown Native Plugin有効化
  experimental: {
    enableNativePlugin: true
  },

  // ビルド設定（Rolldown対応）
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Rolldownのデフォルトminifier（Oxc）を使用
    minify: true,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      treeshake: true,
      input: {
        main: './index.html'
      },
      output: {
        // Rolldown の advancedChunks を使用（manualChunks から移行）
        advancedChunks: {
          groups: [
            {
              name: 'core',
              test: /\/(core|timeUtils|laneEngine)/
            },
            {
              name: 'services',
              test: /\/services\//
            },
            {
              name: 'ui',
              test: /\/ui\//
            }
          ]
        }
      }
    }
  },

  // モジュール解決設定
  resolve: {
    alias: {
      '@': new URL('./', import.meta.url).pathname,
      '@core': new URL('./core', import.meta.url).pathname,
      '@services': new URL('./services', import.meta.url).pathname,
      '@ui': new URL('./ui', import.meta.url).pathname,
    }
  },

  // CSS設定
  css: {
    devSourcemap: true,
    modules: false // CSS Modulesは使用しない（Vanilla CSS維持）
  },

  // 最適化設定
  optimizeDeps: {
    include: [],
    exclude: []
  },

  // テスト設定（Vitestと共通）
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'test/',
        '**/*.test.js',
        '**/*.spec.js'
      ]
    }
  },

  // 本番環境での設定
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
    __VERSION__: JSON.stringify(process.env.npm_package_version),
  },

  // ESLint連携（将来的な拡張用）
  esbuild: {
    target: 'es2022',
    format: 'esm',
    platform: 'browser'
  }
});