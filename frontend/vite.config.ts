/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite / Vitest の設定
// Docker コンテナ内で起動した際にホストのポートマッピングが機能するよう、
// 0.0.0.0（host: true）でリッスンし、ポートは docker-compose.yml と一致させる。
// テストは jsdom 環境・globals 有効で実行し、@testing-library/jest-dom の
// マッチャーをセットアップファイルで読み込む。
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 0.0.0.0 で待ち受ける（コンテナ外部からアクセス可能にする）
    port: 5173, // docker-compose.yml のポートマッピングと一致させる
  },
  test: {
    // React コンポーネントのテストのため DOM 環境（jsdom）を用いる。
    environment: 'jsdom',
    // describe / it / expect などをインポート不要で使えるようにする。
    globals: true,
    // jest-dom のカスタムマッチャー（toBeInTheDocument など）を登録する。
    setupFiles: ['./src/test/setup.ts'],
  },
});
