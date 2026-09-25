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
 * 勤務予定照会の網羅性 property テスト（要件 2.6、3.6）。
 *
 * 目的:
 *  - 任意の登録状態に対して、自身の勤務予定照会（getMyWeekSchedule）が Target_Week の
 *    7 日分すべてを返し、各日が「登録済みの勤務区分」または「未登録（null）」の
 *    いずれか一方で表現されること（登録がない日は必ず未登録印になること）を検証する。
 *  - 複合一意制約・照会ロジックを含む実コードパスを通す統合テストとして実行する
 *    （設計 Testing Strategy、要件 2.6）。
 *
 * 実行方針（round-trip テスト schedule.upsert.roundtrip.spec.ts と同一）:
 *  - 実 PostgreSQL に対して実行する。接続先は TEST_DATABASE_* / DATABASE_* の環境変数、
 *    未指定時は docker-compose.yml の既定値（localhost:5432 の teamapp）を用いる。
 *  - DB へ接続できない環境ではテストをスキップし、実行手順を案内する（破壊的な失敗にしない）。
 *  - beforeAll でマイグレーション up()、afterAll で down() を実行し、副作用を残さない。
 *
 * 決定性の確保:
 *  - ScheduleService はサーバー現在日から Target_Week を導出するため、登録する日付は
 *    resolveTargetWeek(today) が返す 7 日の部分集合から生成し、常に範囲内にする。
 *  - 各 property run の冒頭で対象ユーザーの全予定行を削除し、run 間の状態を独立させる。
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

describe('勤務予定照会の網羅性 property テスト（要件 2.6、3.6）', () => {
  const dataSource = buildTestDataSource();
  let skipReason: string | null = null;

  // 実コードパスを通すため、DataSource のリポジトリで実サービスを組み立てる。
  let scheduleService: ScheduleService;
  let usersService: UsersService;
  // 網羅性検証の対象ユーザー（既知のメールアドレスで解決させる）。
  const userEmail = 'coverage-001@example.com';
  // 解決済みの内部 userId（サービス呼び出し・run 前の全予定削除に使う）。
  let userId: string;

  beforeAll(async () => {
    // まず接続を試み、失敗した場合はスキップ理由を記録する。
    skipReason = await tryConnect(dataSource);
    if (skipReason) {
      // 接続できない環境では実行手順を明示してスキップする。
      // eslint-disable-next-line no-console
      console.warn(
        [
          '[coverage] テスト用 PostgreSQL に接続できないためスキップします。',
          `[coverage] 接続エラー: ${skipReason}`,
          '[coverage] ローカルで実行するには次のいずれかで PostgreSQL を用意してください:',
          '[coverage]   - リポジトリ直下で `docker compose up -d postgres`',
          '[coverage]   - もしくは TEST_DATABASE_HOST 等の環境変数で接続先を指定',
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
    usersService = new UsersService(
      dataSource.getRepository(User),
      dataSource.getRepository(Team),
    );
    scheduleService = new ScheduleService(
      dataSource.getRepository(Schedule),
      usersService,
    );

    // 対象ユーザーを 1 件投入し、findByEmail で解決できるようにする。
    // role は NOT NULL（DB 既定値なし）のため明示的に設定する。
    await dataSource.getRepository(User).insert({
      email: userEmail,
      name: '網羅性検証太郎',
      passwordHash: 'dummy-hash',
      role: UserRole.Employee,
      teamId: null,
    });

    // サービス呼び出し・run 前の全予定削除（where: { userId }）に使う内部 userId を解決しておく。
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

  // Feature: ai-team-planner, Property 5: 照会・集約結果は Target_Week の 7 日分を網羅し未登録日を区別する
  // 任意の登録状態について、getMyWeekSchedule は Target_Week の 7 日分すべてを返し、
  // 各日は「登録済みの勤務区分」または「未登録（null）」のいずれか一方で表現される。
  // Validates: Requirements 2.6, 3.6
  it('Property 5: 照会結果は 7 日分を網羅し登録済み／未登録を区別する', async () => {
    if (skipReason) {
      return; // 接続不可のためスキップ（beforeAll で案内済み）
    }

    // サーバー現在日から導出される Target_Week の 7 日を基準にする。
    // ScheduleService は同じ現在日を基準に照会するため、常に一致し決定的。
    const today = new Date().toISOString().slice(0, 10);
    const { dates } = resolveTargetWeek(today);
    const scheduleRepository = dataSource.getRepository(Schedule);

    await fc.assert(
      fc.asyncProperty(
        // 7 日のうち登録する日付の部分集合（空集合も許容し「全日未登録」を含める）。
        fc.subarray(dates),
        // 登録する各日に割り当てる勤務区分の並び（部分集合の各要素に対応させる）。
        fc.array(fc.constantFrom(WorkLocation.Office, WorkLocation.Remote), {
          minLength: dates.length,
          maxLength: dates.length,
        }),
        async (registeredDates, workLocationPool) => {
          // run 間の状態を独立させるため、対象ユーザーの全予定行を先に削除する。
          await scheduleRepository.delete({ userId });

          // 登録対象日ごとに勤務区分を割り当てて upsert する。
          // 期待値（登録済み日 -> 勤務区分）のマップも同時に構築する。
          const expectedByDate = new Map<string, WorkLocation>();
          registeredDates.forEach((date, index) => {
            const workLocation = workLocationPool[index];
            expectedByDate.set(date, workLocation);
          });

          for (const [date, workLocation] of expectedByDate) {
            const upsertResult = await scheduleService.upsertMySchedule(
              userId,
              date,
              workLocation,
            );
            expect(upsertResult.success).toBe(true);
          }

          // 照会結果を取得する。
          const week = await scheduleService.getMyWeekSchedule(userId);

          // (a) 7 日分ちょうどを、Target_Week の日付順で網羅していること。
          expect(week.days).toHaveLength(dates.length);
          expect(week.days.map((day) => day.date)).toEqual(dates);

          // (b)/(c) 各日は登録済みなら書き込んだ勤務区分、未登録なら null であること。
          for (const day of week.days) {
            if (expectedByDate.has(day.date)) {
              expect(day.workLocation).toBe(expectedByDate.get(day.date));
            } else {
              expect(day.workLocation).toBeNull();
            }
          }
        },
      ),
      // DB を伴う照会のため実行回数は控えめにする。
      { numRuns: 20 },
    );
  });
});
