/**
 * =============================================================================
 * 大量ダミーデータ投入スクリプト（動作確認用ユーティリティ）
 * =============================================================================
 *
 * 目的:
 *   デプロイ後、ダッシュボード・チームカレンダー・AI 分析の各画面が
 *   実データでどう見えるかを確認できるように、DB へ大量のダミーデータを投入する。
 *   具体的には、ダミーの従業員（Employee）を複数作成し、Target_Week（翌週の月〜日）
 *   7 日分の出社／在宅予定を「曜日ごとに偏りを持たせて」投入する。
 *   さらに AI 分析の過多／過少警告が実際に出るよう、しきい値を人数に合わせて調整する。
 *
 * 重要:
 *   - ここで作るダミー従業員には共通の既定パスワード（bcrypt ハッシュ）を設定するため、
 *     必要であればログインして操作することも可能。cognitoSub は null（自前認証方式）。
 *     ダッシュボード・カレンダー・分析は DB を読むだけなので、ログインなしでも
 *     これらの画面に反映される。
 *   - 既存の管理者ユーザーは変更しない（ダミー従業員のみ追加）。
 *
 * 冪等性:
 *   - チームは name で find-or-create。
 *   - 従業員は email で find-or-create（再実行で重複しない）。
 *   - 勤務予定は (userId, date) で upsert。
 *   - しきい値設定は既存があれば値のみ更新、なければ作成。
 *
 * 実行方法（Docker 本番イメージ）:
 *   docker compose exec backend npm run seed:dummy:prod
 * 実行方法（ローカル ts-node）:
 *   npm run seed:dummy
 * =============================================================================
 */

import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import AppDataSource from './data-source';
import { Team } from './entities/team.entity';
import { User } from './entities/user.entity';
import { Schedule } from './entities/schedule.entity';
import { ThresholdSetting } from './entities/threshold-setting.entity';
import { UserRole, WorkLocation } from './entities/enums';
import { resolveTargetWeek } from './domain/target-week';

/** bcrypt のソルトラウンド数（認証サービスと揃える）。 */
const BCRYPT_SALT_ROUNDS = 10;

/** ダミー従業員に共通で設定する既定パスワード（8 文字以上）。ログイン確認用。 */
const DUMMY_DEFAULT_PASSWORD = 'Passw0rd!';

/** ダミー従業員の氏名一覧（日本語のダミー名）。 */
const DUMMY_NAMES: string[] = [
  '佐藤太郎',
  '鈴木花子',
  '高橋一郎',
  '田中美咲',
  '伊藤健太',
  '渡辺真由',
  '山本大輔',
  '中村さくら',
  '小林翔',
  '加藤結衣',
  '吉田拓也',
  '山田愛',
  '佐々木亮',
    '松本健',
  '井上直樹',
  '木村七海',
  '林陽介',
  '清水彩',
];

/** チームへメンバーを割り当てる重み（チームA を多めにする）。 */
function teamNameForIndex(index: number, teamNames: string[]): string {
  // 3 人に 2 人はチームA、残りを B / C へ回す簡易ロジック。
  if (index % 3 !== 2) {
    return teamNames[0];
  }
  // インデックスに応じて B / C を交互に割り当てる。
  const rest = teamNames.slice(1);
  if (rest.length === 0) {
    return teamNames[0];
  }
  return rest[Math.floor(index / 3) % rest.length];
}

/**
 * 各曜日（0=月〜6=日）の「出社率」を定義する。
 * 曜日ごとに偏りを持たせ、ダッシュボードの出社率／在宅率が日々変わるようにする。
 * また AI 分析で過多（多い日）・過少（少ない日）の両方が出るよう、極端な日を含める。
 *   月: 0.95（ほぼ全員出社 → 過多想定）
 *   火: 0.10（ほとんど在宅 → 過少想定）
 *   水: 0.60
 *   木: 0.40
 *   金: 0.80
 *   土: 0.05（休日想定・ほぼ在宅）
 *   日: 0.05
 */
const OFFICE_RATIO_BY_WEEKDAY: number[] = [0.95, 0.1, 0.6, 0.4, 0.8, 0.05, 0.05];

/** チームを name で find-or-create する。 */
async function findOrCreateTeam(name: string): Promise<Team> {
  const repo = AppDataSource.getRepository(Team);
  const existing = await repo.findOne({ where: { name } });
  if (existing) {
    return existing;
  }
  return repo.save(repo.create({ name }));
}

/**
 * ダミー従業員を find-or-create する（email で照合）。
 * 自前認証方式のため cognitoSub は null とし、共通の既定パスワードハッシュを設定する。
 *
 * @param index 連番（0 始まり）
 * @param teamId 所属チーム id
 * @param passwordHash 全ダミー従業員で共有する bcrypt ハッシュ
 */
async function upsertDummyEmployee(
  index: number,
  teamId: string,
  passwordHash: string,
): Promise<User> {
  const repo = AppDataSource.getRepository(User);
  const seq = String(index + 1).padStart(2, '0');
  const email = `dummy-emp-${seq}@example.com`;
  const name = DUMMY_NAMES[index] ?? `ダミー従業員${seq}`;

  const existing = await repo.findOne({
    where: { email },
  });
  if (existing) {
    existing.cognitoSub = null;
    existing.email = email;
    existing.name = name;
    existing.role = UserRole.Employee;
    existing.passwordHash = passwordHash;
    existing.teamId = teamId;
    return repo.save(existing);
  }
  return repo.save(
    repo.create({
      cognitoSub: null,
      email,
      name,
      role: UserRole.Employee,
      passwordHash,
      teamId,
    }),
  );
}

/**
 * 勤務予定を (userId, date) で upsert する。
 * TypeORM の upsert（ON CONFLICT）で衝突時は work_location を更新する。
 */
async function upsertSchedule(
  userId: string,
  date: string,
  workLocation: WorkLocation,
): Promise<void> {
  const repo = AppDataSource.getRepository(Schedule);
  await repo.upsert({ userId, date, workLocation }, ['userId', 'date']);
}

/**
 * しきい値設定を、ダミー人数に見合った値へ調整する。
 * 既存レコードがあれば値のみ更新、なければ作成する。
 * updatedBy は既存ユーザーの id を流用する（管理者がいればその id）。
 */
async function adjustThreshold(employeeCount: number): Promise<void> {
  const repo = AppDataSource.getRepository(ThresholdSetting);

  // 人数の 70% を上限、25% を下限の目安にする（0〜100、upper>lower を保証）。
  let upper = Math.round(employeeCount * 0.7);
  let lower = Math.round(employeeCount * 0.25);
  upper = Math.min(100, Math.max(1, upper));
  lower = Math.min(upper - 1, Math.max(0, lower));

  // updatedBy 用のユーザー id を確保する（管理者優先、なければ任意の 1 名）。
  const userRepo = AppDataSource.getRepository(User);
  const admin = await userRepo.findOne({
    where: { role: UserRole.Administrator },
  });
  const anyUser = admin ?? (await userRepo.findOne({ where: {} }));
  if (!anyUser) {
    console.log('[しきい値] ユーザーが存在しないため設定をスキップしました。');
    return;
  }

  const existing = await repo.findOne({ where: {}, order: { id: 'ASC' } });
  if (existing) {
    existing.upperThreshold = upper;
    existing.lowerThreshold = lower;
    existing.updatedBy = anyUser.id;
    await repo.save(existing);
  } else {
    await repo.save(
      repo.create({
        upperThreshold: upper,
        lowerThreshold: lower,
        updatedBy: anyUser.id,
      }),
    );
  }
  console.log(`[しきい値] 上限=${upper} / 下限=${lower} に設定しました。`);
}

async function run(): Promise<void> {
  console.log('=== 大量ダミーデータ投入を開始します ===');
  await AppDataSource.initialize();
  console.log('[DB] データソースを初期化しました。');

  try {
    // Target_Week（翌週の月〜日 7 日分）をサーバー現在日から導出する。
    const today = new Date().toISOString().slice(0, 10);
    const { weekStart, dates } = resolveTargetWeek(today);
    console.log(`[対象週] weekStart=${weekStart} / 日付=${dates.join(', ')}`);

    // 1) チームを用意する（チームA を多めに割り当てる）。
    const teamNames = ['チームA', 'チームB', 'チームC'];
    const teams: Team[] = [];
    for (const name of teamNames) {
      teams.push(await findOrCreateTeam(name));
    }
    console.log(`[チーム] 用意: ${teamNames.join(' / ')}`);

    // 2) ダミー従業員を作成する（全員に共通の既定パスワードハッシュを設定）。
    const dummyPasswordHash = await bcrypt.hash(
      DUMMY_DEFAULT_PASSWORD,
      BCRYPT_SALT_ROUNDS,
    );
    const employees: User[] = [];
    for (let i = 0; i < DUMMY_NAMES.length; i++) {
      const teamName = teamNameForIndex(i, teamNames);
      const team = teams.find((t) => t.name === teamName) ?? teams[0];
      employees.push(await upsertDummyEmployee(i, team.id, dummyPasswordHash));
    }
    console.log(`[従業員] ${employees.length} 名を作成／更新しました。`);
    console.log(
      `[従業員] 全ダミー従業員の既定パスワード: "${DUMMY_DEFAULT_PASSWORD}"` +
        '（email は dummy-emp-01@example.com 形式。ログイン確認に利用可能）',
    );

    // 3) 勤務予定を投入する。曜日ごとの出社率に従って office/remote を決める。
    let scheduleCount = 0;
    for (let d = 0; d < dates.length; d++) {
      const date = dates[d];
      const officeRatio = OFFICE_RATIO_BY_WEEKDAY[d] ?? 0.5;
      // 当日の出社人数（切り捨て）。
      const officeTarget = Math.round(employees.length * officeRatio);
      for (let i = 0; i < employees.length; i++) {
        // 先頭から officeTarget 人を office、それ以降を remote にする（決定的）。
        const workLocation =
          i < officeTarget ? WorkLocation.Office : WorkLocation.Remote;
        await upsertSchedule(employees[i].id, date, workLocation);
        scheduleCount++;
      }
    }
    console.log(`[勤務予定] ${scheduleCount} 件を upsert しました。`);

    // 4) しきい値をダミー人数に合わせて調整する（AI 分析の警告が出るように）。
    await adjustThreshold(employees.length);

    console.log('=== 大量ダミーデータ投入が正常に完了しました ===');
    console.log(
      `※ ダッシュボード／カレンダーで weekStart=${weekStart} の週を確認してください。`,
    );
  } finally {
    await AppDataSource.destroy();
    console.log('[DB] データソースを破棄しました。');
  }
}

run().catch((error) => {
  console.error('[エラー] ダミーデータ投入に失敗しました:', error);
  process.exitCode = 1;
});
