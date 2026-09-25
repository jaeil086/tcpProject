import 'reflect-metadata';
import * as fc from 'fast-check';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { buildTypeOrmOptions } from '../config/typeorm.config';
import { InitialSchema1717000000000 } from '../migrations/1717000000000-InitialSchema';
import { Schedule } from '../entities/schedule.entity';
import { User } from '../entities/user.entity';
import { Team } from '../entities/team.entity';
import { UserRole, WorkLocation } from '../entities/enums';
import { resolveTargetWeek } from '../domain/target-week';
import { UsersService } from '../users/users.service';
import { ScheduleService } from './schedule.service';

/**
 * 勤務予定 upsert の統合テスト（round-trip、要件 2.1）。
 *
 * 目的:
 *  - ScheduleService.upsertMySchedule で登録した直後に getMyWeekSchedule で照会すると、
 *    同一 (user, date) について書き込んだ勤務区分がそのまま返ることを検証する（round-trip）。
 *  - 純粋ドメインロジックではなく、実 DB（複合一意制約に基づく upsert）を含めた
 *    実コードパスを通す統合テストとして実行する（設計 Testing Strategy）。
 *
 * 実行方針（スモークテスト initial-schema.smoke.spec.ts と同一）:
 *  - 実 PostgreSQL に対して実行する。接続先は TEST_DATABASE_* / DATABASE_* の環境変数、
 *    未指定時は docker-compose.yml の既定値（localhost:5432 の teamapp）を用いる。
 *  - DB へ接続できない環境ではテストをスキップし、実行手順を案内する（破壊的な失敗にしない）。
 *  - beforeAll でマイグレーション up()、afterAll で down() を実行し、副作用を残さない。
 *
 * 決定性の確保:
 *  - ScheduleService はサーバー現在日から Target_Week を導出して範囲検証を行うため、
 *    テスト日付は resolveTargetWeek(today) が返す平日 5 日のいずれかから生成し、常に範囲内にする。
 *  - サービスへ渡す userId を解決できるよう、既知のメールアドレスを持つ User 行を
 *    事前に投入し、findByEmail で内部 id を取得する。
 */

// テスト用の接続オプション。TEST_DATABASE_* を優先し、なければ DATABASE_* / 既定値を使う。
function buildTestDataSource(): DataSource {
  const base = buildTypeOrmOptions() as PostgresConnectionOptions;
  return new DataSource({
    ...base,
    host: process.env.TEST_DATABASE_HOST ?? base.host,
    port: Number(process.env.TEST_DATABASE_PORT ?? base.port),
    username: process.env.TEST_DATABASE_USER ?? base.username,
    password: process.env.TEST_DATABASE_PASSWORD ?? base.password,
    database: process.env.TEST_DATABASE_NAME ?? base.database,
    // マイグレーションは手動で up()/down() するため自動実行は無効化する。
    migrationsRun: false,
    synchronize: false,
    logging: false,
  });
}

// DB へ接続できるかを事前に確認する。接続不可なら理由（エラーメッセージ）を返す。
async function tryConnect(dataSource: DataSource): Promise<string | null> {
  try {
    await dataSource.initialize();
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message;
  }
}

describe('勤務予定 upsert の統合テスト（round-trip、要件 2.1）', () => {
  const dataSource = buildTestDataSource();
  let skipReason: string | null = null;

  // 実コードパスを通すため、DataSource のリポジトリで実サービスを組み立てる。
  let scheduleService: ScheduleService;
  // round-trip の対象ユーザー（既知のメールアドレスで解決させる）。
  const userEmail = 'roundtrip-001@example.com';
  // 解決済みの内部 userId（beforeAll で確定させ、サービス呼び出しに使う）。
  let userId: string;

  beforeAll(async () => {
    // まず接続を試み、失敗した場合はスキップ理由を記録する。
    skipReason = await tryConnect(dataSource);
    if (skipReason) {
      // 接続できない環境では実行手順を明示してスキップする。
      // eslint-disable-next-line no-console
      console.warn(
        [
          '[roundtrip] テスト用 PostgreSQL に接続できないためスキップします。',
          `[roundtrip] 接続エラー: ${skipReason}`,
          '[roundtrip] ローカルで実行するには次のいずれかで PostgreSQL を用意してください:',
          '[roundtrip]   - リポジトリ直下で `docker compose up -d postgres`',
          '[roundtrip]   - もしくは TEST_DATABASE_HOST 等の環境変数で接続先を指定',
        ].join('\n'),
      );
      return;
    }

    // クリーンな状態から適用するため、既存スキーマがあれば先に落としてから up() する。
    const runner = dataSource.createQueryRunner();
    try {
      const migration = new InitialSchema1717000000000();
      await migration.down(runner).catch(() => undefined);
      await migration.up(runner);
    } finally {
      await runner.release();
    }

    // 実リポジトリで実サービスを組み立てる（DI を使わず直接インスタンス化する）。
    const usersService = new UsersService(
      dataSource.getRepository(User),
      dataSource.getRepository(Team),
    );
    scheduleService = new ScheduleService(
      dataSource.getRepository(Schedule),
      usersService,
    );

    // round-trip の対象ユーザーを 1 件投入し、findByEmail で解決できるようにする。
    // role は NOT NULL（DB 既定値なし）のため明示的に設定する。
    await dataSource.getRepository(User).insert({
      email: userEmail,
      name: 'ラウンドトリップ太郎',
      passwordHash: 'dummy-hash',
      role: UserRole.Employee,
      teamId: null,
    });

    // サービス呼び出しに使う内部 userId を解決しておく。
    const user = await usersService.findByEmail(userEmail);
    if (!user) {
      throw new Error('テスト用ユーザーの投入・解決に失敗しました。');
    }
    userId = user.id;
  });

  afterAll(async () => {
    if (!dataSource.isInitialized) {
      return;
    }
    // 適用したスキーマを元に戻して副作用を残さない。
    if (!skipReason) {
      const runner = dataSource.createQueryRunner();
      try {
        const migration = new InitialSchema1717000000000();
        await migration.down(runner);
      } finally {
        await runner.release();
      }
    }
    await dataSource.destroy();
  });

  // Feature: ai-team-planner, Property 1: 勤務予定登録の round-trip
  // 任意の (Target_Week 内の日付, 勤務区分) について、upsert 直後に同一 (user, date) を
  // 照会すると、書き込んだ勤務区分がそのまま返る。
  // Validates: Requirements 2.1
  it('Property 1: upsert 直後に同一 (user, date) を照会すると同一値が返る', async () => {
    if (skipReason) {
      return; // 接続不可のためスキップ（beforeAll で案内済み）
    }

    // サーバー現在日から導出される Target_Week の平日 5 日を対象日候補にする。
    // ScheduleService は同じ現在日を基準に範囲検証するため、常に範囲内となり決定的。
    const today = new Date().toISOString().slice(0, 10);
    const { dates } = resolveTargetWeek(today);

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...dates),
        fc.constantFrom(WorkLocation.Office, WorkLocation.Remote),
        async (date, workLocation) => {
          // 登録・更新（同一 (user, date) の upsert は冪等なので run 間の状態が安定する）。
          const upsertResult = await scheduleService.upsertMySchedule(
            userId,
            date,
            workLocation,
          );
          expect(upsertResult.success).toBe(true);

          // 照会し、対象日のエントリが書き込んだ勤務区分と一致することを検証する。
          const week = await scheduleService.getMyWeekSchedule(userId);
          const entry = week.days.find((day) => day.date === date);
          expect(entry).toBeDefined();
          expect(entry?.workLocation).toBe(workLocation);
        },
      ),
      // DB を伴う round-trip のため実行回数は控えめにする。
      { numRuns: 25 },
    );
  });
});
