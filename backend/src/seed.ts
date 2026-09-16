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
 *   本アプリは Cognito で認証し、ログイン後に request.user.sub（Cognito のサブ
 *   ジェクト識別子）を cognito_sub 列で DB の User に解決する。したがって
 *   ログイン後画面を確認するには、Cognito ユーザーの `sub` と一致する
 *   cognitoSub を持つ User が DB に存在している必要がある。
 *
 * 冪等性:
 *   本スクリプトは繰り返し実行しても安全（idempotent）。
 *   - チームは name で照合し、存在すれば更新・なければ作成する。
 *   - ユーザーは cognitoSub または email で照合し、存在すれば更新・なければ作成する。
 *   - しきい値設定は 1 件も無い場合のみ既定値（上限 70／下限 30）を作成する。
 *
 * 環境変数（ユーザー投入用）:
 *   管理者ユーザー:
 *     SEED_ADMIN_COGNITO_SUB   … Cognito ユーザーの sub（必須。未設定なら管理者はスキップ）
 *     SEED_ADMIN_EMAIL         … 管理者のメールアドレス（任意。未設定なら既定値）
 *     SEED_ADMIN_NAME          … 管理者の氏名（任意。未設定なら既定値）
 *   従業員ユーザー:
 *     SEED_EMPLOYEE_COGNITO_SUB … Cognito ユーザーの sub（必須。未設定なら従業員はスキップ）
 *     SEED_EMPLOYEE_EMAIL       … 従業員のメールアドレス（任意。未設定なら既定値）
 *     SEED_EMPLOYEE_NAME        … 従業員の氏名（任意。未設定なら既定値）
 *
 *   Cognito の sub の確認方法:
 *     AWS マネジメントコンソール > Cognito > 対象の User Pool > 「ユーザー」
 *     > 対象ユーザーを選択 > 「sub」属性の値をコピーする。
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
import AppDataSource from './data-source';
import { Team } from './entities/team.entity';
import { User } from './entities/user.entity';
import { ThresholdSetting } from './entities/threshold-setting.entity';
import { UserRole } from './entities/enums';

/** 投入対象ユーザーの入力値をまとめた型 */
interface SeedUserInput {
  /** ログ表示用のラベル（例: 管理者 / 従業員） */
  label: string;
  cognitoSub: string;
  email: string;
  name: string;
  role: UserRole;
  /** 所属させるチーム名 */
  teamName: string;
}

/** 環境変数が未設定・空文字の場合に既定値へフォールバックする補助関数 */
function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
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
 * ユーザーを cognitoSub または email で冪等に upsert する。
 * どちらかに一致する既存ユーザーがあればフィールドを更新し、無ければ新規作成する。
 */
async function upsertUser(input: SeedUserInput, teamId: string): Promise<User> {
  const repo = AppDataSource.getRepository(User);

  // cognitoSub もしくは email のいずれかに一致する既存ユーザーを探索する
  const existing = await repo.findOne({
    where: [{ cognitoSub: input.cognitoSub }, { email: input.email }],
  });

  if (existing) {
    existing.cognitoSub = input.cognitoSub;
    existing.email = input.email;
    existing.name = input.name;
    existing.role = input.role;
    existing.teamId = teamId;
    const updated = await repo.save(existing);
    console.log(
      `[ユーザー] 既存を更新: ${input.label} "${input.email}"（id=${updated.id}, role=${input.role}）`,
    );
    return updated;
  }

  const created = await repo.save(
    repo.create({
      cognitoSub: input.cognitoSub,
      email: input.email,
      name: input.name,
      role: input.role,
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

    // 2) 管理者ユーザーを投入する（SEED_ADMIN_COGNITO_SUB が必須）
    let adminUserId: string | null = null;
    const adminSub = process.env.SEED_ADMIN_COGNITO_SUB?.trim();
    if (adminSub) {
      const admin = await upsertUser(
        {
          label: '管理者',
          cognitoSub: adminSub,
          email: envOrDefault(process.env.SEED_ADMIN_EMAIL, 'admin@example.com'),
          name: envOrDefault(process.env.SEED_ADMIN_NAME, '管理者ユーザー'),
          role: UserRole.Administrator,
          teamName: teamA.name,
        },
        teamA.id,
      );
      adminUserId = admin.id;
    } else {
      console.log(
        '[管理者] SEED_ADMIN_COGNITO_SUB が未設定のため作成をスキップしました。\n' +
          '  → Cognito ユーザーの sub を設定してください。' +
          '（AWS コンソール > Cognito > User Pool > ユーザー > 対象ユーザー > 「sub」属性）',
      );
    }

    // 3) 従業員ユーザーを投入する（SEED_EMPLOYEE_COGNITO_SUB が必須）
    const employeeSub = process.env.SEED_EMPLOYEE_COGNITO_SUB?.trim();
    if (employeeSub) {
      await upsertUser(
        {
          label: '従業員',
          cognitoSub: employeeSub,
          email: envOrDefault(process.env.SEED_EMPLOYEE_EMAIL, 'employee@example.com'),
          name: envOrDefault(process.env.SEED_EMPLOYEE_NAME, '従業員ユーザー'),
          role: UserRole.Employee,
          teamName: teamA.name,
        },
        teamA.id,
      );
    } else {
      console.log(
        '[従業員] SEED_EMPLOYEE_COGNITO_SUB が未設定のため作成をスキップしました。\n' +
          '  → Cognito ユーザーの sub を設定してください。' +
          '（AWS コンソール > Cognito > User Pool > ユーザー > 対象ユーザー > 「sub」属性）',
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
