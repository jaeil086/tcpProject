import 'reflect-metadata';
import * as fc from 'fast-check';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { buildTypeOrmOptions } from '../config/typeorm.config';
import { InitialSchema1717000000000 } from '../migrations/1717000000000-InitialSchema';
import { Schedule } from '../entities/schedule.entity';
import { User } from '../entities/user.entity';
import { Team } from '../entities/team.entity';
import { UserRole } from '../entities/enums';
import { UsersService } from '../users/users.service';
import { TeamsService } from '../teams/teams.service';
import { CalendarService } from './calendar.service';

/**
 * カレンダー集約のチームフィルタ property テスト（要件 3.3）。
 *
 * 目的:
 *  - 任意の選択チームについて、getTeamCalendar が返すメンバーは「選択チームに所属する
 *    メンバー」のみで構成され、他チームのメンバーを一切含まないことを検証する
 *    （チームフィルタは所属メンバーのみを返す。要件 3.3）。
 *  - 純粋ドメインロジックではなく、実 DB（team_id によるフィルタ）を含めた実コードパスを
 *    通す統合テストとして実行する（設計 Testing Strategy）。
 *
 * 実行方針（round-trip / coverage テストと同一）:
 *  - 実 PostgreSQL に対して実行する。接続先は TEST_DATABASE_* / DATABASE_* の環境変数、
 *    未指定時は docker-compose.yml の既定値（localhost:5432 の teamapp）を用いる。
 *  - DB へ接続できない環境ではテストをスキップし、実行手順を案内する（破壊的な失敗にしない）。
 *  - beforeAll でマイグレーション up()、afterAll で down() を実行し、副作用を残さない。
 *
 * 決定性の確保:
 *  - beforeAll で複数チームと各チームへ振り分けたメンバー集合を一度だけ投入する（固定シード）。
 *  - property では投入済みチーム ID 群から選択チームのみを生成し、返却メンバー集合が
 *    「そのチームに割り当てた既知メンバー集合」と厳密に一致することを検証する。
 *    これにより run 間の状態が安定し、再クリーニング不要で決定的になる。
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

describe('カレンダー集約のチームフィルタ property テスト（要件 3.3）', () => {
  const dataSource = buildTestDataSource();
  let skipReason: string | null = null;

  // 実コードパスを通すため、DataSource のリポジトリで実サービスを組み立てる。
  let calendarService: CalendarService;

  // リクエストユーザーのメール（任意チーム所属。teamId 明示指定でフィルタするため所属は結果に影響しない）。
  const requesterEmail = 'teamfilter-requester-001@example.com';
  // 投入後に確定するリクエストユーザーの内部 userId（サービス呼び出しに使う）。
  let requesterId: string;

  // 投入したチーム ID 群（property で選択チームを生成する対象）。
  let seededTeamIds: string[] = [];
  // teamId -> そのチームに割り当てた既知メンバーの userId 集合（期待値の照合に使う）。
  const expectedMemberIdsByTeam = new Map<string, Set<string>>();

  beforeAll(async () => {
    // まず接続を試み、失敗した場合はスキップ理由を記録する。
    skipReason = await tryConnect(dataSource);
    if (skipReason) {
      // 接続できない環境では実行手順を明示してスキップする。
      // eslint-disable-next-line no-console
      console.warn(
        [
          '[calendar] テスト用 PostgreSQL に接続できないためスキップします。',
          `[calendar] 接続エラー: ${skipReason}`,
          '[calendar] ローカルで実行するには次のいずれかで PostgreSQL を用意してください:',
          '[calendar]   - リポジトリ直下で `docker compose up -d postgres`',
          '[calendar]   - もしくは TEST_DATABASE_HOST 等の環境変数で接続先を指定',
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
    const teamsService = new TeamsService(
      dataSource.getRepository(Team),
      dataSource.getRepository(User),
    );
    calendarService = new CalendarService(
      dataSource.getRepository(Schedule),
      usersService,
      teamsService,
    );

    const teamRepository = dataSource.getRepository(Team);
    const userRepository = dataSource.getRepository(User);

    // 3 チームを投入する。
    const teamDefs = [
      { name: 'チームA' },
      { name: 'チームB' },
      { name: 'チームC' },
    ];
    const savedTeams = await teamRepository.save(
      teamDefs.map((def) => teamRepository.create(def)),
    );
    seededTeamIds = savedTeams.map((team) => team.id);
    for (const teamId of seededTeamIds) {
      expectedMemberIdsByTeam.set(teamId, new Set<string>());
    }

    // メンバーを各チームへ偏りをもって振り分ける（チームごとの人数を変える）。
    // 分布: チームA=3 名、チームB=2 名、チームC=1 名（合計 6 名）。
    const distribution = [
      seededTeamIds[0],
      seededTeamIds[0],
      seededTeamIds[0],
      seededTeamIds[1],
      seededTeamIds[1],
      seededTeamIds[2],
    ];
    for (let index = 0; index < distribution.length; index += 1) {
      const teamId = distribution[index];
      const inserted = await userRepository.save(
        userRepository.create({
          cognitoSub: `teamfilter-member-${index}`,
          email: `teamfilter-member-${index}@example.com`,
          name: `メンバー${index}`,
          role: UserRole.Employee,
          teamId,
        }),
      );
      expectedMemberIdsByTeam.get(teamId)!.add(inserted.id);
    }

    // リクエストユーザーを投入する（teamId を明示指定するため、所属チームは結果に影響しない）。
    // role は NOT NULL（DB 既定値なし）のため明示的に設定する。
    const requester = await userRepository.save(
      userRepository.create({
        email: requesterEmail,
        name: 'フィルタ検証太郎',
        passwordHash: 'dummy-hash',
        role: UserRole.Employee,
        teamId: seededTeamIds[0],
      }),
    );
    // サービスはトークン由来の userId で解決するため、投入後の内部 id を保持する。
    requesterId = requester.id;
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

  // Feature: ai-team-planner, Property 7: チームフィルタは所属メンバーのみを返す
  // 任意の選択チームについて、getTeamCalendar が返すメンバー集合は「選択チームに所属する
  // メンバー集合」と厳密に一致し、他チームのメンバーを一切含まない。
  // Validates: Requirements 3.3
  it('Property 7: 返却メンバーは選択チームの所属メンバーと厳密に一致する', async () => {
    if (skipReason) {
      return; // 接続不可のためスキップ（beforeAll で案内済み）
    }

    await fc.assert(
      fc.asyncProperty(
        // 投入済みチーム ID 群から選択チームを生成する。
        fc.constantFrom(...seededTeamIds),
        async (selectedTeamId) => {
          const calendar = await calendarService.getTeamCalendar(
            requesterId,
            selectedTeamId,
          );

          // 解決された対象チームは選択チームであること。
          expect(calendar.teamId).toBe(selectedTeamId);

          // 返却メンバーの userId 集合を組み立てる。
          const returnedMemberIds = new Set(
            calendar.members.map((member) => member.userId),
          );

          // 期待メンバー集合（選択チームに割り当てた既知メンバー）。
          const expectedMemberIds =
            expectedMemberIdsByTeam.get(selectedTeamId) ?? new Set<string>();

          // (a) 返却メンバーはすべて選択チーム所属である（他チーム混入なし）。
          for (const memberId of returnedMemberIds) {
            expect(expectedMemberIds.has(memberId)).toBe(true);
          }

          // (b) 選択チームの所属メンバーはすべて返却されている（取りこぼしなし）。
          for (const memberId of expectedMemberIds) {
            expect(returnedMemberIds.has(memberId)).toBe(true);
          }

          // (c) 集合として厳密に一致する（件数も一致）。
          expect(returnedMemberIds.size).toBe(expectedMemberIds.size);
        },
      ),
      // DB を伴う集約のため実行回数は控えめにする。
      { numRuns: 20 },
    );
  });
});
