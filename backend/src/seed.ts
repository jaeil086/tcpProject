/**
 * =============================================================================
 * データベース シードスクリプト（デプロイ／ログイン後動作確認用ユーティリティ）
 * =============================================================================
 *
 * 目的:
 *   EC2 等へのデプロイ後、Cognito でのログインを経て表示されるログイン後画面
 *   （ダッシュボード・カレンダー等）を確認するために、DB へ最低限の初期データ
 *   （チーム／管理者ユーザー／従業員ユーザー／しきい値設定）を投入する。
 *
 *   本アプリは自前認証方式（bcrypt によるパスワードハッシュ + 自己発行 JWT）で
 *   認証する。ログイン後画面を確認するには、メールアドレスと（bcrypt でハッシュ化
 *   した）パスワードを持つ User が DB に存在し、その資格情報でログインできれば良い。
 *   cognitoSub は旧方式の名残であり、本シードでは常に null を設定する。
 *
 * 冪等性:
 *   本スクリプトは繰り返し実行しても安全（idempotent）。
 *   - チームは name で照合し、存在すれば更新・なければ作成する。
 *   - ユーザーは email で照合し、存在すれば更新・なければ作成する。
 *   - しきい値設定は 1 件も無い場合のみ既定値（上限 70／下限 30）を作成する。
 *
 * 環境変数（ユーザー投入用）:
 *   管理者ユーザー:
 *     SEED_ADMIN_EMAIL      … 管理者のメールアドレス（任意。未設定なら 'admin@example.com'）
 *     SEED_ADMIN_PASSWORD   … 管理者の平文パスワード（任意。未設定なら既定値 'Passw0rd!'）
 *     SEED_ADMIN_NAME       … 管理者の氏名（任意。未設定なら既定値）
 *   従業員ユーザー:
 *     SEED_EMPLOYEE_EMAIL    … 従業員のメールアドレス（任意。設定時のみ従業員を投入）
 *     SEED_EMPLOYEE_PASSWORD … 従業員の平文パスワード（任意。未設定なら既定値 'Passw0rd!'）
 *     SEED_EMPLOYEE_NAME     … 従業員の氏名（任意。未設定なら既定値）
 *
 *   管理者は SEED_ADMIN_EMAIL 未設定時も既定メールで必ず投入されるため、
 *   シードを実行すれば常にログイン可能な管理者アカウントが 1 つ得られる。
 *   パスワードが env で与えられない場合は既定値を用い、警告を出力するので、
 *   本番では必ず SEED_ADMIN_PASSWORD を設定し、初回ログイン後に変更すること。
 *
 *   DB 接続は src/config/typeorm.config.ts が参照する DATABASE_* 環境変数で行う。
 *
 * 実行方法（ローカル）:
 *   backend ディレクトリで、環境変数を設定したうえで:
 *     npm run seed
 *
 * 実行方法（Docker）:
 *   イメージをビルドしたうえで、backend コンテナ内で実行する:
 *     docker compose exec backend npm run seed
 *   ※ Docker で実行する場合、上記 SEED_* 環境変数を backend コンテナから参照できる
 *     必要がある（例: .env に追記して docker compose に読み込ませる）。
 *
 * 注意:
 *   - DB へ接続できない環境では初期化時にエラーとなるが、これは想定内の挙動。
 *   - スキーマは事前にマイグレーション（npm run migration:run）で作成しておくこと。
 * =============================================================================
 */

import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import AppDataSource from './data-source';
import { Team } from './entities/team.entity';
import { User } from './entities/user.entity';
import { ThresholdSetting } from './entities/threshold-setting.entity';
import { UserRole } from './entities/enums';

/** bcrypt のソルトラウンド数（認証サービスと揃える）。 */
const BCRYPT_SALT_ROUNDS = 10;

/** パスワード env 未設定時に用いる既定パスワード（8 文字以上）。本番では必ず変更すること。 */
const DEFAULT_SEED_PASSWORD = 'Passw0rd!';

/** 投入対象ユーザーの入力値をまとめた型 */
interface SeedUserInput {
  /** ログ表示用のラベル（例: 管理者 / 従業員） */
  label: string;
  email: string;
  name: string;
  role: UserRole;
  /** bcrypt でハッシュ化済みのパスワード */
  passwordHash: string;
  /** 所属させるチーム名 */
  teamName: string;
}

/** 環境変数が未設定・空文字の場合に既定値へフォールバックする補助関数 */
function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

/**
 * パスワード env を解決し、bcrypt でハッシュ化して返す。
 * env が未設定・空文字の場合は既定パスワードを用い、警告を出力する。
 *
 * @param rawPassword env から取得した平文パスワード（未設定可）
 * @param label ログ表示用ラベル（例: 管理者）
 * @param envName 参照した環境変数名（警告メッセージ用）
 * @returns bcrypt ハッシュと、実際に用いた平文パスワード（ログ表示用）
 */
async function resolvePasswordHash(
  rawPassword: string | undefined,
  label: string,
  envName: string,
): Promise<{ passwordHash: string; usedPassword: string }> {
  const trimmed = rawPassword?.trim();
  const usedPassword =
    trimmed && trimmed.length > 0 ? trimmed : DEFAULT_SEED_PASSWORD;
  if (!trimmed || trimmed.length === 0) {
    console.warn(
      `[警告] ${label}の${envName} が未設定のため、既定パスワード '${DEFAULT_SEED_PASSWORD}' を使用します。` +
        '本番環境では必ず環境変数でパスワードを設定し、初回ログイン後に変更してください。',
    );
  }
  const passwordHash = await bcrypt.hash(usedPassword, BCRYPT_SALT_ROUNDS);
  return { passwordHash, usedPassword };
}

/**
 * チームを name で冪等に upsert する。
 * 既存があればそのまま返し、無ければ新規作成する（チームは name 以外に更新項目が無い）。
 */
async function upsertTeam(name: string): Promise<Team> {
  const repo = AppDataSource.getRepository(Team);
  const existing = await repo.findOne({ where: { name } });
  if (existing) {
    console.log(`[チーム] 既存を再利用: "${name}"（id=${existing.id}）`);
    return existing;
  }
  const created = await repo.save(repo.create({ name }));
  console.log(`[チーム] 新規作成: "${name}"（id=${created.id}）`);
  return created;
}

/**
 * ユーザーを email で冪等に upsert する。
 * email に一致する既存ユーザーがあればフィールド（パスワードハッシュ含む）を更新し、
 * 無ければ新規作成する。自前認証方式のため cognitoSub は常に null を設定する。
 */
async function upsertUser(input: SeedUserInput, teamId: string): Promise<User> {
  const repo = AppDataSource.getRepository(User);

  // email に一致する既存ユーザーを探索する（email はログイン識別子）。
  const existing = await repo.findOne({
    where: { email: input.email },
  });

  if (existing) {
    existing.cognitoSub = null;
    existing.email = input.email;
    existing.name = input.name;
    existing.role = input.role;
    existing.passwordHash = input.passwordHash;
    existing.teamId = teamId;
    const updated = await repo.save(existing);
    console.log(
      `[ユーザー] 既存を更新: ${input.label} "${input.email}"（id=${updated.id}, role=${input.role}）`,
    );
    return updated;
  }

  const created = await repo.save(
    repo.create({
      cognitoSub: null,
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: input.passwordHash,
      teamId,
    }),
  );
  console.log(
    `[ユーザー] 新規作成: ${input.label} "${input.email}"（id=${created.id}, role=${input.role}）`,
  );
  return created;
}

/**
 * しきい値設定を初期化する。
 * 既に 1 件でも存在する場合は何もしない。存在しない場合のみ既定値で作成する。
 * updatedBy には管理者ユーザーの id を用いるため、管理者が投入されていない場合はスキップする。
 */
async function seedThresholdSetting(adminUserId: string | null): Promise<void> {
  const repo = AppDataSource.getRepository(ThresholdSetting);
  const count = await repo.count();
  if (count > 0) {
    console.log('[しきい値設定] 既存レコードが存在するため作成をスキップしました。');
    return;
  }
  if (!adminUserId) {
    console.log(
      '[しきい値設定] 管理者ユーザーが投入されていないため作成をスキップしました。' +
        '（updated_by に設定する管理者 id が必要です）',
    );
    return;
  }
  const created = await repo.save(
    repo.create({
      upperThreshold: 70,
      lowerThreshold: 30,
      updatedBy: adminUserId,
    }),
  );
  console.log(
    `[しきい値設定] 既定値で新規作成: 上限=70 / 下限=30（id=${created.id}, updatedBy=${adminUserId}）`,
  );
}

/**
 * シード本処理。
 * チームを作成し、環境変数が揃っているユーザーのみ投入し、最後にしきい値設定を初期化する。
 */
async function run(): Promise<void> {
  console.log('=== データベース シード処理を開始します ===');

  await AppDataSource.initialize();
  console.log('[DB] データソースを初期化しました。');

  try {
    // 1) チームを投入する（ユーザー投入の有無に関わらず常に作成する）
    const teamA = await upsertTeam('チームA');
    await upsertTeam('チームB');

    // 2) 管理者ユーザーを投入する（SEED_ADMIN_EMAIL 未設定時も既定メールで必ず作成する）
    const adminEmail = envOrDefault(
      process.env.SEED_ADMIN_EMAIL,
      'admin@example.com',
    );
    const adminPassword = await resolvePasswordHash(
      process.env.SEED_ADMIN_PASSWORD,
      '管理者',
      'SEED_ADMIN_PASSWORD',
    );
    const admin = await upsertUser(
      {
        label: '管理者',
        email: adminEmail,
        name: envOrDefault(process.env.SEED_ADMIN_NAME, '管理者ユーザー'),
        role: UserRole.Administrator,
        passwordHash: adminPassword.passwordHash,
        teamName: teamA.name,
      },
      teamA.id,
    );
    const adminUserId: string | null = admin.id;
    console.log(
      `[管理者] ログイン資格情報 → email: "${adminEmail}" / password: "${adminPassword.usedPassword}"`,
    );

    // 3) 従業員ユーザーを投入する（SEED_EMPLOYEE_EMAIL が指定された場合のみ）
    const employeeEmail = process.env.SEED_EMPLOYEE_EMAIL?.trim();
    if (employeeEmail && employeeEmail.length > 0) {
      const employeePassword = await resolvePasswordHash(
        process.env.SEED_EMPLOYEE_PASSWORD,
        '従業員',
        'SEED_EMPLOYEE_PASSWORD',
      );
      await upsertUser(
        {
          label: '従業員',
          email: employeeEmail,
          name: envOrDefault(process.env.SEED_EMPLOYEE_NAME, '従業員ユーザー'),
          role: UserRole.Employee,
          passwordHash: employeePassword.passwordHash,
          teamName: teamA.name,
        },
        teamA.id,
      );
      console.log(
        `[従業員] ログイン資格情報 → email: "${employeeEmail}" / password: "${employeePassword.usedPassword}"`,
      );
    } else {
      console.log(
        '[従業員] SEED_EMPLOYEE_EMAIL が未設定のため従業員ユーザーの作成をスキップしました。' +
          '（従業員も投入する場合は SEED_EMPLOYEE_EMAIL / SEED_EMPLOYEE_PASSWORD を設定してください）',
      );
    }

    // 4) しきい値設定を初期化する（管理者が投入された場合のみ）
    await seedThresholdSetting(adminUserId);

    console.log('=== データベース シード処理が正常に完了しました ===');
  } finally {
    // 成否に関わらず接続を破棄する
    await AppDataSource.destroy();
    console.log('[DB] データソースを破棄しました。');
  }
}

run().catch((error) => {
  console.error('[エラー] シード処理に失敗しました:', error);
  process.exitCode = 1;
});
