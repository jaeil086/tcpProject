import 'reflect-metadata';
import * as fc from 'fast-check';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { buildTypeOrmOptions } from '../config/typeorm.config';
import { InitialSchema1717000000000 } from '../migrations/1717000000000-InitialSchema';
import { Schedule } from '../entities/schedule.entity';
import { User } from '../entities/user.entity';
import { UserRole, WorkLocation } from '../entities/enums';
import { resolveTargetWeek } from '../domain/target-week';
import { UsersService } from '../users/users.service';
import { ScheduleService } from './schedule.service';

/**
 * 勤務予定 upsert の単一性 property テスト（要件 2.4、2.7）。
 *
 * 目的:
 *  - 同一 (user, date) に対して任意の登録操作列（勤務区分の並び）を順に適用したとき、
 *    適用後に保持される勤務予定行が常に高々 1 件であり、その値が最後に登録した
 *    勤務区分と一致することを、実 DB（複合一意制約に基づく upsert）を通して検証する。
 *  - 純粋ドメインロジックではなく、複合一意制約 (user_id, date) を含む実コードパスを
 *    通す統合テストとして実行する（設計 Testing Strategy、要件 2.7）。
 *
 * 実行方針（round-trip テスト schedule.upsert.roundtrip.spec.ts と同一）:
 *  - 実 PostgreSQL に対して実行する。接続先は TEST_DATABASE_* / DATABASE_* の環境変数、
 *    未指定時は docker-compose.yml の既定値（localhost:5432 の teamapp）を用いる。
 *  - DB へ接続できない環境ではテストをスキップし、実行手順を案内する（破壊的な失敗にしない）。
 *  - beforeAll でマイグレーション up()、afterAll で down() を実行し、副作用を残さない。
 *
 * 決定性の確保:
 *  - ScheduleService はサーバー現在日から Target_Week を導出して範囲検証を行うため、
 *    テスト日付は resolveTargetWeek(today) が返す 7 日のいずれかから生成し、常に範囲内にする。
 *  - 各 property run の冒頭で対象 (user, date) の既存行を削除し、run 間の状態を独立させる。
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

describe('勤務予定 upsert の単一性 property テスト（要件 2.4、2.7）', () => {
  const dataSource = buildTestDataSource();
  let skipReason: string | null = null;

  // 実コードパスを通すため、DataSource のリポジトリで実サービスを組み立てる。
  let scheduleService: ScheduleService;
  let usersService: UsersService;
  // 単一性検証の対象ユーザー（既知の cognitoSub で解決させる）。
  const cognitoSub = 'uniqueness-sub-001';
  // 解決済みの内部 userId（beforeAll で確定させ、行数カウントの where 条件に使う）。
  let userId: string;

  beforeAll(async () => {
    // まず接続を試み、失敗した場合はスキップ理由を記録する。
    skipReason = await tryConnect(dataSource);
    if (skipReason) {
      // 接続できない環境では実行手順を明示してスキップする。
      // eslint-disable-next-line no-console
      console.warn(
        [
          '[uniqueness] テスト用 PostgreSQL に接続できないためスキップします。',
          `[uniqueness] 接続エラー: ${skipReason}`,
          '[uniqueness] ローカルで実行するには次のいずれかで PostgreSQL を用意してください:',
          '[uniqueness]   - リポジトリ直下で `docker compose up -d postgres`',
          '[uniqueness]   - もしくは TEST_DATABASE_HOST 等の環境変数で接続先を指定',
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
    usersService = new UsersService(dataSource.getRepository(User));
    scheduleService = new ScheduleService(
      dataSource.getRepository(Schedule),
      usersService,
    );

    // 対象ユーザーを 1 件投入し、findByCognitoSub で解決できるようにする。
    // role は NOT NULL（DB 既定値なし）のため明示的に設定する。
    await dataSource.getRepository(User).insert({
      cognitoSub,
      email: 'uniqueness-001@example.com',
      name: '単一性検証太郎',
      role: UserRole.Employee,
      teamId: null,
    });

    // 行数カウント（where: { userId, date }）に使う内部 userId を解決しておく。
    const user = await usersService.findByCognitoSub(cognitoSub);
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

  // Feature: ai-team-planner, Property 3: upsert による単一性（同一ユーザー・同一日は常に 1 件かつ最新値）
  // 同一 (user, date) に対する任意の登録操作列を順に適用した後、当該 (user, date) の
  // 勤務予定行は常に高々 1 件であり、その値は最後に登録した勤務区分と一致する。
  // Validates: Requirements 2.4, 2.7
  it('Property 3: 操作列の適用後も (user, date) の勤務予定は 1 件かつ最新値', async () => {
    if (skipReason) {
      return; // 接続不可のためスキップ（beforeAll で案内済み）
    }

    // サーバー現在日から導出される Target_Week の 7 日を対象日候補にする。
    // ScheduleService は同じ現在日を基準に範囲検証するため、常に範囲内となり決定的。
    const today = new Date().toISOString().slice(0, 10);
    const { dates } = resolveTargetWeek(today);
    const scheduleRepository = dataSource.getRepository(Schedule);

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...dates),
        // 同一日付に対する 1 件以上の登録操作列（勤務区分の並び）を生成する。
        fc.array(fc.constantFrom(WorkLocation.Office, WorkLocation.Remote), {
          minLength: 1,
          maxLength: 6,
        }),
        async (date, workLocationSequence) => {
          // run 間の状態を独立させるため、対象 (user, date) の既存行を先に削除する。
          await scheduleRepository.delete({ userId, date });

          // 生成された操作列を順に適用する（各操作は同一 (user, date) への upsert）。
          for (const workLocation of workLocationSequence) {
            const upsertResult = await scheduleService.upsertMySchedule(
              cognitoSub,
              date,
              workLocation,
            );
            expect(upsertResult.success).toBe(true);
          }

          // (a) 当該 (user, date) の勤務予定行はちょうど 1 件であること。
          const count = await scheduleRepository.count({
            where: { userId, date },
          });
          expect(count).toBe(1);

          // (b) 保持される勤務区分は操作列の最後の値と一致すること。
          const lastWorkLocation =
            workLocationSequence[workLocationSequence.length - 1];
          const week = await scheduleService.getMyWeekSchedule(cognitoSub);
          const entry = week.days.find((day) => day.date === date);
          expect(entry).toBeDefined();
          expect(entry?.workLocation).toBe(lastWorkLocation);
        },
      ),
      // DB を伴う upsert 列のため実行回数は控えめにする。
      { numRuns: 20 },
    );
  });
});
