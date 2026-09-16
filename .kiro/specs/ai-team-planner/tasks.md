# Implementation Plan: AI Team Planner

実装計画

## Overview

本実装計画は、承認済みの要件定義書（`requirements.md`）および設計書（`design.md`）に基づき、AI Team Planner をインクリメンタルに構築するためのコーディングタスク一覧である。モノレポ（frontend / backend / infra）のスキャフォールディングから始め、DB エンティティ／マイグレーション、副作用のない純粋ドメインロジックとその property-based test（fast-check、最低 100 回実行）、バックエンドの各モジュールと API エンドポイント、フロントエンドの各機能画面へと段階的に積み上げる。

各タスクは前段のタスクの成果物を前提に構築し、最終的に全体を結線する。孤立したコードが残らないよう配慮する。純粋ドメインロジックに対する property テストは、設計書の Correctness Properties（Property 1〜12）を参照し、各プロパティを 1 つの property テストとして実装する。タグ形式は `// Feature: ai-team-planner, Property {番号}: {プロパティ本文}` とする。

技術スタックは設計書に従い、Frontend は React / TypeScript / Vite / TailwindCSS、Backend は NestJS / TypeScript、Database は PostgreSQL（TypeORM）、認証は AWS Cognito、インフラは Docker / AWS EC2 とする。property テストには fast-check を用いる。コード識別子は英語、コードコメントは日本語で記述する。

## Tasks

- [x] 1. モノレポの基盤とローカル統合環境をセットアップする
  - `teamApp/` 直下に `docker-compose.yml`（frontend / backend / postgres の 3 サービス）を作成する
  - ルート `README.md` にローカル起動手順（`docker compose up`）を追記する
  - `infra/ec2/` にデプロイ手順の雛形（README）を作成する
  - _Requirements: 全体基盤_

- [x] 2. Backend（NestJS）のプロジェクトスキャフォールディングを作成する
  - [x] 2.1 NestJS プロジェクトと共通設定を作成する
    - `backend/package.json`、`tsconfig.json`、`nest-cli.json`、`Dockerfile` を作成する
    - `src/main.ts`（ブートストラップ）、`src/app.module.ts`（ルートモジュール）を作成する
    - TypeORM の PostgreSQL 接続設定を `app.module.ts` に組み込む
    - _Requirements: 全体基盤_

  - [x] 2.2 テスト基盤（Jest + fast-check）をセットアップする
    - `backend/package.json` に Jest と fast-check の依存とテストスクリプトを追加する
    - `jest.config` を作成し、`fc.assert(..., { numRuns: 100 })` を用いる方針をサンプルで確認する
    - _Requirements: 全体基盤（Testing Strategy）_

- [x] 3. DB エンティティとマイグレーションを実装する
  - [x] 3.1 TypeORM エンティティを定義する
    - `src/entities/` に `User`、`Team`、`Schedule`、`ThresholdSetting` エンティティを作成する
    - `WorkLocation`（office/remote）、`UserRole`（employee/administrator）の enum を定義する
    - _Requirements: 1, 2.2, 2.7, 3.3, 4.3_

  - [x] 3.2 マイグレーションと一意制約・インデックスを実装する
    - `src/migrations/` に初期スキーマのマイグレーションを作成する
    - `USER.cognito_sub`・`USER.email` の一意制約、`SCHEDULE (user_id, date)` の複合一意制約、`SCHEDULE (date)` インデックスを定義する
    - _Requirements: 2.7_

  - [x] 3.3 エンティティ／マイグレーションのスモークテストを書く
    - テスト用 DB に対しマイグレーションが適用され複合一意制約が効くことを確認する
    - _Requirements: 2.7_

- [x] 4. 純粋ドメインロジック（副作用なし）とその property テストを実装する
  - [x] 4.1 TargetWeekResolver を実装する
    - `src/domain/target-week.ts` に、基準日から Target_Week（翌週の月〜日、7 日間）を導出し範囲内判定する純粋関数を実装する
    - _Requirements: 2.1, 2.5_

  - [x] 4.2 TargetWeekResolver の property テストを書く
    - **Property 4: Target_Week 範囲外の登録は拒否され状態は不変**
    - **Validates: Requirements 2.5**
    - 範囲外日付が必ず拒否されること、範囲内 7 日を網羅することを fast-check（numRuns: 100）で検証する
    - _Requirements: 2.5_

  - [x] 4.3 WorkLocationValidator を実装する
    - `src/domain/work-location.ts` に、入力が `office`/`remote` のいずれかであることを検証する純粋関数を実装する
    - _Requirements: 2.2, 2.3_

  - [x] 4.4 WorkLocationValidator の property テストを書く
    - **Property 2: 勤務区分は 2 値のみを受理する**
    - **Validates: Requirements 2.2, 2.3**
    - 任意文字列に対し office/remote のみ受理し他は拒否することを fast-check（numRuns: 100）で検証する
    - _Requirements: 2.2, 2.3_

  - [x] 4.5 OccupancyCalculator を実装する
    - `src/domain/occupancy.ts` に、勤務予定集合から日別 Occupancy_Count・出社率・在宅率を算出する純粋関数を実装する
    - _Requirements: 3.2, 4.1, 4.5_

  - [x]* 4.6 OccupancyCalculator の property テスト（Occupancy_Count）を書く
    - **Property 6: Occupancy_Count は当日 office 登録者数に一致する**
    - **Validates: Requirements 3.2, 4.1**
    - _Requirements: 3.2, 4.1_

  - [x]* 4.7 OccupancyCalculator の property テスト（出社率・在宅率）を書く
    - **Property 8: 出社率・在宅率は 0〜100% に収まり合計が 100% になる**
    - **Validates: Requirements 4.5**
    - 出社者 0 人の日などの境界条件を生成対象に含める
    - _Requirements: 4.5_

  - [x] 4.8 ThresholdValidator を実装する
    - `src/domain/threshold.ts` に、しきい値（0〜100 の整数、upper > lower）を検証する純粋関数を実装する
    - _Requirements: 4.3, 4.4_

  - [x]* 4.9 ThresholdValidator の property テストを書く
    - **Property 10: しきい値は妥当な場合のみ受理され不正時は既存値を保持する**
    - **Validates: Requirements 4.3, 4.4**
    - 0・100・upper=lower などの境界値を生成対象に含める
    - _Requirements: 4.3, 4.4_

  - [x] 4.10 AnalysisEvaluator を実装する
    - `src/domain/analysis-eval.ts` に、日別 Occupancy_Count としきい値から過多／過少警告と勤務パターン要約を生成する純粋関数を実装する
    - 警告メッセージには対象日付と Occupancy_Count を含める
    - _Requirements: 5.2, 5.3, 5.4_

  - [x]* 4.11 AnalysisEvaluator の property テスト（警告生成）を書く
    - **Property 11: 警告は判定条件を満たす日にのみ生成され日付と人数を含む**
    - **Validates: Requirements 5.2, 5.3**
    - _Requirements: 5.2, 5.3_

  - [x]* 4.12 AnalysisEvaluator の property テスト（パターン要約）を書く
    - **Property 12: パターン要約は各日の実データと整合する**
    - **Validates: Requirements 5.4**
    - _Requirements: 5.4_

- [x] 5. Checkpoint - ドメインロジックのテストがすべて通ることを確認する
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. 認証・共通基盤（Auth / Users / Teams）を実装する
  - [x] 6.1 共通ガード・例外フィルタ・デコレータを実装する
    - `src/common/guards/` に `JwtAuthGuard`（Cognito JWKS による JWT 検証）と `RolesGuard` を実装する
    - `src/common/filters/` に統一エラー応答（`ErrorResponse`）を返す例外フィルタを実装する
    - `src/common/decorators/` に `@Roles()` デコレータを実装する
    - _Requirements: 1.1, 1.6, 4.2_

  - [x] 6.2 AuthModule を実装する
    - `POST /auth/login`（Cognito 認証・JWT 返却・失敗／ロックアウト／障害時エラー）、`POST /auth/logout`（トークン無効化）、`GET /auth/me`（プロフィール返却）を実装する
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.7_

  - [ ]* 6.3 AuthModule の例示テストを書く
    - 認証失敗（401）・障害（503）・ロックアウト（423）を Cognito モックで検証する
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 6.4 UsersModule と TeamsModule を実装する
    - UsersModule: `cognito_sub` とアプリユーザーの紐付け、プロフィール・所属チームの解決を実装する
    - TeamsModule: `GET /teams`（チーム一覧）とチーム別メンバー取得を実装する
    - _Requirements: 1, 3.3, 3.4_

  - [ ]* 6.5 RolesGuard の認可テストを書く
    - 非 Administrator による管理者機能アクセスが 403 で拒否されることを検証する
    - _Requirements: 4.2_

- [x] 7. ScheduleModule（勤務予定の登録・更新・照会）を実装する
  - [x] 7.1 勤務予定の upsert・照会 API を実装する
    - `PUT /schedules/me`（`INSERT ... ON CONFLICT (user_id, date) DO UPDATE` による upsert）を実装する
    - TargetWeekResolver・WorkLocationValidator を用いて範囲外・不正値を拒否し既存を変更しない
    - `GET /schedules/me?weekStart=`（Target_Week 7 日分を登録済み／未登録を区別して返却）を実装する
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x]* 7.2 勤務予定 upsert の統合テスト（round-trip）を書く
    - **Property 1: 勤務予定登録の round-trip**
    - **Validates: Requirements 2.1**
    - DB を含め、登録直後に同一 (user, date) を照会すると同一値が返ることを検証する
    - _Requirements: 2.1_

  - [x]* 7.3 勤務予定 upsert の property テスト（単一性）を書く
    - **Property 3: upsert による単一性（同一ユーザー・同一日は常に 1 件かつ最新値）**
    - **Validates: Requirements 2.4, 2.7**
    - _Requirements: 2.4, 2.7_

  - [x]* 7.4 勤務予定照会の property テスト（7 日網羅・未登録区別）を書く
    - **Property 5: 照会・集約結果は Target_Week の 7 日分を網羅し未登録日を区別する**
    - **Validates: Requirements 2.6, 3.6**
    - _Requirements: 2.6, 3.6_

- [x] 8. CalendarModule（チーム週次集約）を実装する
  - [x] 8.1 カレンダー集約 API を実装する
    - `GET /calendar?teamId=&weekStart=`（未指定時は自チーム）を実装し、OccupancyCalculator で日別 Occupancy_Count を算出して返す
    - チームフィルタにより所属メンバーのみ返却する
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

  - [x]* 8.2 カレンダー集約の property テスト（チームフィルタ）を書く
    - **Property 7: チームフィルタは所属メンバーのみを返す**
    - **Validates: Requirements 3.3**
    - _Requirements: 3.3_

  - [x]* 8.3 カレンダー集約の例示・エッジケーステストを書く
    - 対象週に勤務予定が 0 件の場合の未登録メッセージ、取得失敗時の挙動を検証する
    - _Requirements: 3.5, 3.7_

- [x] 9. DashboardModule（ダッシュボード・しきい値）を実装する
  - [x] 9.1 ダッシュボード集計 API としきい値管理 API を実装する
    - `GET /dashboard/occupancy`（日別 Occupancy_Count・出社率・在宅率）、`GET /dashboard/attendees?date=`（出社者一覧）を実装する
    - `GET /dashboard/threshold`・`PUT /dashboard/threshold`（ThresholdValidator で検証、不正時は既存値保持）を実装する
    - RolesGuard により Administrator のみ許可する
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x]* 9.2 出社者一覧の property テストを書く
    - **Property 9: 出社者一覧は当日 office 登録者と整合する**
    - **Validates: Requirements 4.6**
    - _Requirements: 4.6_

  - [x]* 9.3 ダッシュボードの例示・エッジケーステストを書く
    - 出社登録者が 0 人の日のメッセージ、しきい値不正入力時の拒否・既存値保持を検証する
    - _Requirements: 4.4, 4.7_

- [x] 10. AnalysisModule（AI 分析）を実装する
  - [x] 10.1 AI 分析実行 API を実装する
    - `POST /analysis/run?weekStart=` を実装し、AnalysisEvaluator で警告メッセージとパターン要約を生成して返す
    - 対象勤務予定が 0 件の場合は対象なしメッセージを返し警告・要約を生成しない。処理失敗時は勤務予定を変更しない
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7_

  - [ ]* 10.2 AI 分析の例示・エッジケーステストを書く
    - 対象データ 0 件時の非生成、分析失敗時のデータ不変を検証する
    - _Requirements: 5.6, 5.7_

- [x] 11. Checkpoint - バックエンドのテストがすべて通ることを確認する
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Frontend（React + Vite）のスキャフォールディングを作成する
  - [x] 12.1 Vite プロジェクトと共通設定を作成する
    - `frontend/package.json`、`vite.config.ts`、`tsconfig.json`、`tailwind.config.js`、`index.html`、`Dockerfile` を作成する
    - `src/main.tsx`（エントリポイント）、`src/App.tsx`（ルーティング定義）を作成する
    - _Requirements: 全体基盤_

  - [x] 12.2 API クライアントと共有型・日付ユーティリティを実装する
    - `src/api/`（`client.ts`・`schedules.ts`・`calendar.ts`・`dashboard.ts`・`analysis.ts`）を実装する
    - `src/lib/` に日付・週計算ユーティリティ、`src/types/` に共有型を実装する
    - _Requirements: 全体基盤_

  - [ ]* 12.3 日付・週計算ユーティリティの property テストを書く
    - `frontend/src/lib/` の週計算が Target_Week（月〜日 7 日）と整合することを fast-check（numRuns: 100）で検証する
    - _Requirements: 2.1, 2.5, 3.1_

- [x] 13. 認証機能（フロント）を実装する
  - [x] 13.1 AuthProvider / ProtectedRoute / LoginPage を実装する
    - `src/auth/`（`AuthProvider.tsx`・`ProtectedRoute.tsx`・`cognito.ts`）で認証状態管理と保護ルートを実装する
    - `src/features/login/`（LoginPage）でログインフォームと認証失敗・ロックアウト・障害メッセージを表示する
    - 未認証／トークン失効時は元アクセス先を保持してログイン画面へリダイレクトする
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 13.2 認証ガード・リダイレクトの例示テストを書く
    - 未認証／失効時のリダイレクトと元アクセス先の保持を検証する
    - _Requirements: 1.1, 1.6, 1.7_

- [x] 14. 勤務予定・カレンダー画面（フロント）を実装する
  - [x] 14.1 ScheduleEditor を実装する
    - `src/features/schedule/`（ScheduleEditor）で翌週勤務予定の登録・更新フォーム、勤務区分選択、対象範囲外・不正値の一次抑止を実装する
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 14.2 TeamCalendar を実装する
    - `src/features/calendar/`（TeamCalendar）でチーム週次カレンダー、Occupancy_Count 表示、チーム選択、未登録表示、取得エラー表示を実装する
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 14.3 スケジュール・カレンダー画面の例示テストを書く
    - フォーム一次バリデーション、未登録表示、取得失敗時の既存表示不変を検証する
    - _Requirements: 2.3, 2.5, 3.5, 3.6, 3.7_

- [x] 15. 管理者ダッシュボード・分析パネル（フロント）を実装する
  - [x] 15.1 AdminDashboard を実装する
    - `src/features/dashboard/`（AdminDashboard）で Occupancy_Count・出社率／在宅率、日別出社者一覧、しきい値設定フォームを実装する
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 15.2 AnalysisPanel を実装する
    - `src/features/analysis/`（AnalysisPanel）で AI 分析実行、全警告メッセージ・パターン要約の表示、対象なしメッセージを実装する
    - _Requirements: 5.1, 5.5, 5.6_

  - [ ]* 15.3 ダッシュボード・分析パネルの例示テストを書く
    - しきい値不正入力時の拒否表示、0 人時メッセージ、全警告・要約の描画、分析失敗表示を検証する
    - _Requirements: 4.4, 4.7, 5.5, 5.6, 5.7_

- [x] 16. 全体の結線と統合テスト
  - [x] 16.1 フロントとバックエンドを結線する
    - App のルーティングに全画面を組み込み、API クライアント経由でバックエンド各エンドポイントと接続する
    - docker-compose 上で 3 サービスが疎通することを確認する
    - _Requirements: 1, 2, 3, 4, 5_

  - [ ]* 16.2 代表シナリオの統合テストを書く
    - ログイン → 勤務予定登録 → カレンダー表示 → ダッシュボード → 分析実行の代表フローを 1〜3 例で検証する
    - _Requirements: 1, 2, 3, 4, 5_

- [x] 17. Final checkpoint - すべてのテストが通ることを確認する
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- `*` 付きのサブタスクは任意（テスト関連）であり、MVP を急ぐ場合はスキップ可能である。コア実装タスクには `*` を付けない。
- 各タスクはトレーサビリティのため特定の要件番号を参照する。
- property テストは設計書の Correctness Properties（Property 1〜12）を検証する。各プロパティは 1 つの property テストとして実装し、fast-check を最低 100 回実行する。各テストには `// Feature: ai-team-planner, Property {番号}: {プロパティ本文}` 形式のタグを付与する。
- 単体・例示・統合テストは property テストと相補的であり、認証（Cognito 依存）・認可・パフォーマンス・UI 遷移・障害時表示・空データ境界を補完する。
- Checkpoint タスクでインクリメンタルに検証する。

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1", "12.1"] },
    { "id": 2, "tasks": ["3.2", "4.1", "4.3", "4.5", "4.8", "4.10", "12.2"] },
    { "id": 3, "tasks": ["3.3", "4.2", "4.4", "4.6", "4.7", "4.9", "4.11", "4.12", "6.1", "12.3"] },
    { "id": 4, "tasks": ["6.2", "6.4", "13.1"] },
    { "id": 5, "tasks": ["6.3", "6.5", "7.1", "13.2"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.4", "8.1", "9.1", "10.1", "14.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "9.2", "9.3", "10.2", "14.2"] },
    { "id": 8, "tasks": ["14.3", "15.1", "15.2"] },
    { "id": 9, "tasks": ["15.3", "16.1"] },
    { "id": 10, "tasks": ["16.2"] }
  ]
}
```
