import 'reflect-metadata';
import * as fc from 'fast-check';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { buildTypeOrmOptions } from '../config/typeorm.config';
import { InitialSchema1717000000000 } from '../migrations/1717000000000-InitialSchema';
import { Schedule } from '../entities/schedule.entity';
import { User } from '../entities/user.entity';
import { Team } from '../entities/team.entity';
import { ThresholdSetting } from '../entities/threshold-setting.entity';
import { UserRole, WorkLocation } from '../entities/enums';
import { countOccupancy, ScheduleRecord } from '../domain/occupancy';
import { UsersService } from '../users/users.service';
import { DashboardService } from './dashboard.service';

/**
 * 出社者一覧の property テスト（要件 4.6）。
 *
 * 目的:
 *  - 任意の「当日の勤務区分割り当て」について、getAttendees(date) が返す出社者集合は
 *    「当日 office を登録したユーザー集合」と厳密に一致し、件数も Occupancy_Count
 *    （countOccupancy）と一致することを検証する（出社者一覧は当日 office 登録者と整合する。要件 4.6）。
 *  - 純粋ドメインロジックではなく、実 DB（date / work_location によるフィルタと user リレーション）を
 *    含めた実コードパスを通す統合テストとして実行する（設計 Testing Strategy）。
 *
 * 実行方針（round-trip / team-filter テストと同一）:
 *  - 実 PostgreSQL に対して実行する。接続先は TEST_DATABASE_* / DATABASE_* の環境変数、
 *    未指定時は docker-compose.yml の既定値（localhost:5432 の teamapp）を用いる。
 *  - DB へ接続できない環境ではテストをスキップし、実行手順を案内する（破壊的な失敗にしない）。
 *  - beforeAll でマイグレーション up()、afterAll で down() を実行し、副作用を残さない。
 *
 * 決定性の確保:
 *  - beforeAll で固定のユーザー集合を一度だけ投入する（固定シード）。
 *  - getAttendees は date でフィルタするだけで Target_Week 制約を持たないため、
 *    対象日は固定の妥当な日付を用いる。
 *  - 各 run の冒頭で対象日の schedule 行を削除してから割り当てを再投入し、run 間の
 *    状態が混ざらないようにする（決定的）。
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

describe('出社者一覧の property テスト（要件 4.6）', () => {
  const dataSource = buildTestDataSource();
  let skipReason: string | null = null;

  // 実コードパスを通すため、DataSource のリポジトリで実サービスを組み立てる。
  let dashboardService: DashboardService;

  // 対象日（Target_Week 制約なし。getAttendees は date フィルタのみ）。固定の妥当な日付。
  const targetDate = '2025-06-16';

  // 投入した検証用ユーザーの userId 群（property で各ユーザーの勤務区分を生成する対象）。
  let seededUserIds: string[] = [];

  beforeAll(async () => {
    // まず接続を試み、失敗した場合はスキップ理由を記録する。
    skipReason = await tryConnect(dataSource);
    if (skipReason) {
      // 接続できない環境では実行手順を明示してスキップする。
      // eslint-disable-next-line no-console
      console.warn(
        [
          '[dashboard] テスト用 PostgreSQL に接続できないためスキップします。',
          `[dashboard] 接続エラー: ${skipReason}`,
          '[dashboard] ローカルで実行するには次のいずれかで PostgreSQL を用意してください:',
          '[dashboard]   - リポジトリ直下で `docker compose up -d postgres`',
          '[dashboard]   - もしくは TEST_DATABASE_HOST 等の環境変数で接続先を指定',
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
    dashboardService = new DashboardService(
      dataSource.getRepository(Schedule),
      dataSource.getRepository(User),
      dataSource.getRepository(ThresholdSetting),
      usersService,
    );

    // 検証用ユーザー集合を一度だけ投入する（固定シード）。5 名。
    const userRepository = dataSource.getRepository(User);
    const inserted = await userRepository.save(
      Array.from({ length: 5 }, (_unused, index) =>
        userRepository.create({
          cognitoSub: `attendees-user-${index}`,
          email: `attendees-user-${index}@example.com`,
          name: `出社者${index}`,
          role: UserRole.Employee,
          teamId: null,
        }),
      ),
    );
    seededUserIds = inserted.map((user) => user.id);
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

  // Feature: ai-team-planner, Property 9: 出社者一覧は当日 office 登録者と整合する
  // 任意の勤務区分割り当てについて、getAttendees(date) が返す出社者集合は
  // 「当日 office を登録したユーザー集合」と厳密に一致し、件数は Occupancy_Count に一致する。
  // Validates: Requirements 4.6
  it('Property 9: 返却出社者は当日 office 登録者と厳密に一致し件数も一致する', async () => {
    if (skipReason) {
      return; // 接続不可のためスキップ（beforeAll で案内済み）
    }

    const scheduleRepository = dataSource.getRepository(Schedule);

    await fc.assert(
      fc.asyncProperty(
        // 各ユーザーについて {office, remote, none} のいずれかを割り当てる。
        // none はレコードを生成しない（未登録）。
        fc.array(
          fc.constantFrom<'office' | 'remote' | 'none'>(
            'office',
            'remote',
            'none',
          ),
          { minLength: seededUserIds.length, maxLength: seededUserIds.length },
        ),
        async (assignments) => {
          // 決定性のため、対象日の既存レコードを削除してから割り当てを再投入する。
          await scheduleRepository.delete({ date: targetDate });

          // 割り当てに従って schedule 行を作成する（none はレコードなし）。
          const rowsToInsert = seededUserIds
            .map((userId, index) => ({ userId, choice: assignments[index] }))
            .filter((entry) => entry.choice !== 'none')
            .map((entry) =>
              scheduleRepository.create({
                userId: entry.userId,
                date: targetDate,
                workLocation:
                  entry.choice === 'office'
                    ? WorkLocation.Office
                    : WorkLocation.Remote,
              }),
            );
          if (rowsToInsert.length > 0) {
            await scheduleRepository.save(rowsToInsert);
          }

          // 期待される office 登録者の userId 集合を組み立てる。
          const expectedOfficeIds = new Set(
            seededUserIds.filter(
              (_userId, index) => assignments[index] === 'office',
            ),
          );

          // 純粋ドメイン関数（countOccupancy）による期待件数。
          const records: ScheduleRecord[] = rowsToInsert.map((row) => ({
            userId: row.userId,
            date: row.date,
            workLocation: row.workLocation,
          }));
          const expectedCount = countOccupancy(records, targetDate);

          // 実サービスで出社者一覧を取得する。
          const result = await dashboardService.getAttendees(targetDate);

          // 応答の date は対象日であること。
          expect(result.date).toBe(targetDate);

          const returnedIds = new Set(
            result.attendees.map((attendee) => attendee.userId),
          );

          // (a) 返却出社者はすべて office 登録者である（remote / 未登録の混入なし）。
          for (const userId of returnedIds) {
            expect(expectedOfficeIds.has(userId)).toBe(true);
          }

          // (b) office 登録者はすべて返却されている（取りこぼしなし）。
          for (const userId of expectedOfficeIds) {
            expect(returnedIds.has(userId)).toBe(true);
          }

          // (c) 集合として厳密に一致し、件数は Occupancy_Count と一致する。
          expect(returnedIds.size).toBe(expectedOfficeIds.size);
          expect(result.attendees).toHaveLength(expectedCount);
        },
      ),
      // DB を伴う集約のため実行回数は控えめにする。
      { numRuns: 20 },
    );
  });
});
