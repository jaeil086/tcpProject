import type { Config } from 'jest';

// Jest 設定（NestJS + TypeScript）
// - ts-jest により TypeScript のテストをトランスパイルして実行する
// - テストファイルは `*.spec.ts` 形式（設計書 Testing Strategy に準拠）
// - property-based testing には fast-check を用い、各 property テストは
//   `fc.assert(fc.property(...), { numRuns: 100 })` で最低 100 回実行する
const config: Config = {
  // テスト対象のルートは src 配下
  rootDir: 'src',

  // TypeScript のテスト・実装を対象にする
  moduleFileExtensions: ['ts', 'js', 'json'],

  // 実行するテストファイルのパターン（*.spec.ts）
  testRegex: '.*\\.spec\\.ts$',

  // ts-jest でトランスパイルする
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // NestJS はデコレータのメタデータを利用するため tsconfig を明示的に読み込む
        tsconfig: '<rootDir>/../tsconfig.json',
      },
    ],
  },

  // Node.js 環境で実行する（バックエンドのため）
  testEnvironment: 'node',

  // カバレッジ収集対象（任意）
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!**/main.ts'],
  coverageDirectory: '../coverage',
};

export default config;
