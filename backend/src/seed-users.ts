/**
 * 追加のテスト用ユーザーを投入するシードスクリプト。
 *
 * 目的:
 *   既存のテストアカウント（t1@test.com 〜 t12@test.com）に続けて、
 *   t13@test.com 〜 t20@test.com の 8 アカウントを追加する。
 *
 * 命名規則（画面表示に合わせる）:
 *   - メールアドレス: t{N}@test.com（N = 13〜20）
 *   - 氏名:            "user - {MM}"（t12 が "user - 03" のため、N=13 → "user - 04" から開始）
 *                      → 氏名番号 = N - 9（t13→04, t14→05, ... t20→11）
 *   - パスワード:      全アカウント共通で 'qwer1234'
 *   - ロール:          従業員（employee）
 *   - 所属チーム:      未所属（ユーザー管理画面で後から割り当てる想定）
 *
 * 冪等性:
 *   email で find-or-create する。再実行しても重複せず、既存があれば
 *   氏名・パスワードハッシュ・ロールを上書きする。
 *
 * 認証方式:
 *   自前認証方式（bcrypt ハッシュ + 自己発行 JWT）。cognitoSub は常に null。
 *
 * 実行方法:
 *   開発:   npm run seed:users
 *   本番:   npm run seed:users:prod（dist からの実行）
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import AppDataSource from './data-source';
import { User } from './entities/user.entity';
import { UserRole } from './entities/enums';

/** bcrypt のソルトラウンド数（認証サービスと揃える）。 */
const BCRYPT_SALT_ROUNDS = 10;

/** 追加ユーザーに共通で設定するパスワード（平文。ログイン確認用）。 */
const SHARED_PASSWORD = 'qwer1234';

/** 投入するメール連番の範囲（t{START}@test.com 〜 t{END}@test.com）。 */
const EMAIL_SEQ_START = 13;
const EMAIL_SEQ_END = 20;

/**
 * メール連番 N から氏名を生成する。
 * t12 が "user - 03" のため、氏名番号 = N - 9（t13 → "user - 04"）。
 * 氏名番号は 2 桁ゼロ埋め（例: 04, 05, ... 11）。
 */
function buildUserName(emailSeq: number): string {
  const nameSeq = emailSeq - 9;
  const padded = String(nameSeq).padStart(2, '0');
  return `user - ${padded}`;
}

/**
 * ユーザーを email で冪等に upsert する。
 * 既存があればフィールド（氏名・パスワードハッシュ・ロール）を更新し、
 * 無ければ新規作成する。自前認証方式のため cognitoSub は常に null を設定する。
 */
async function upsertTestUser(
  email: string,
  name: string,
  passwordHash: string,
): Promise<User> {
  const repo = AppDataSource.getRepository(User);

  const existing = await repo.findOne({ where: { email } });
  if (existing) {
    existing.cognitoSub = null;
    existing.email = email;
    existing.name = name;
    existing.role = UserRole.Employee;
    existing.passwordHash = passwordHash;
    const updated = await repo.save(existing);
    console.log(
      `[ユーザー] 既存を更新: "${email}" / name="${name}"（id=${updated.id}）`,
    );
    return updated;
  }

  const created = await repo.save(
    repo.create({
      cognitoSub: null,
      email,
      name,
      role: UserRole.Employee,
      passwordHash,
      teamId: null,
    }),
  );
  console.log(
    `[ユーザー] 新規作成: "${email}" / name="${name}"（id=${created.id}）`,
  );
  return created;
}

/** シード処理のエントリポイント。 */
async function run(): Promise<void> {
  await AppDataSource.initialize();
  console.log('=== 追加テストユーザーのシード処理を開始します ===');

  try {
    // 共通パスワードを 1 度だけハッシュ化して全ユーザーで使い回す。
    const passwordHash = await bcrypt.hash(SHARED_PASSWORD, BCRYPT_SALT_ROUNDS);

    for (let seq = EMAIL_SEQ_START; seq <= EMAIL_SEQ_END; seq++) {
      const email = `t${seq}@test.com`;
      const name = buildUserName(seq);
      await upsertTestUser(email, name, passwordHash);
    }

    console.log(
      `[完了] t${EMAIL_SEQ_START}@test.com 〜 t${EMAIL_SEQ_END}@test.com を投入しました` +
        `（共通パスワード: "${SHARED_PASSWORD}" / ロール: 従業員 / 未所属）。`,
    );
    console.log('=== 追加テストユーザーのシード処理が正常に完了しました ===');
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((error) => {
  console.error('追加テストユーザーのシード処理に失敗しました:', error);
  process.exitCode = 1;
});
