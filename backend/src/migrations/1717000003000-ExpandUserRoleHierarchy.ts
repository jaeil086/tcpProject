import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ユーザーロールを 2 値から 3 階層の権限体系へ拡張するスキーマ変更。
 *
 * 変更前: user_role_enum = ('employee', 'administrator')
 * 変更後: user_role_enum = ('employee', 'team_admin', 'super_admin')
 *
 * 既存データの変換規則:
 *  - admin@example.com … 最上位管理者（super_admin）へ変換する。
 *  - その他の administrator … チーム管理者（team_admin）へ変換する。
 *  - employee … そのまま employee を維持する。
 *
 * PostgreSQL の enum はラベルの直接削除が難しいため、
 * 「新しい enum 型を作成 → 列を付け替え（値を変換しつつ）→ 旧型を破棄」という
 * 安全な置換手順で実施する。down() では逆方向に巻き戻す
 * （super_admin / team_admin はいずれも administrator へ戻す）。
 */
export class ExpandUserRoleHierarchy1717000003000
  implements MigrationInterface
{
  name = 'ExpandUserRoleHierarchy1717000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 新しい enum 型を作成する。
    await queryRunner.query(
      `CREATE TYPE "user_role_enum_new" AS ENUM ('employee', 'team_admin', 'super_admin')`,
    );

    // 2) 既定値を一旦外す（列型の付け替えで既定値がキャストできず失敗するのを避ける）。
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT`,
    );

    // 3) role 列を新しい型へ付け替える。旧ラベルを新ラベルへ CASE で変換する。
    //    administrator は暫定的に全て team_admin へ寄せ（最上位の確定は 4 で行う）、
    //    employee はそのまま維持する。
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "role" TYPE "user_role_enum_new" ` +
        `USING (` +
        `  CASE "role"::text ` +
        `    WHEN 'administrator' THEN 'team_admin' ` +
        `    ELSE "role"::text ` +
        `  END` +
        `)::"user_role_enum_new"`,
    );

    // 4) admin@example.com のみ最上位管理者（super_admin）へ引き上げる。
    await queryRunner.query(
      `UPDATE "user" SET "role" = 'super_admin' WHERE "email" = 'admin@example.com'`,
    );

    // 5) 旧 enum 型を破棄し、新しい型を正式名称へリネームする。
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
    await queryRunner.query(
      `ALTER TYPE "user_role_enum_new" RENAME TO "user_role_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1) 旧い 2 値の enum 型を作成する。
    await queryRunner.query(
      `CREATE TYPE "user_role_enum_old" AS ENUM ('employee', 'administrator')`,
    );

    // 2) role 列を旧型へ戻す。super_admin / team_admin はいずれも administrator へ集約する。
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "role" TYPE "user_role_enum_old" ` +
        `USING (` +
        `  CASE "role"::text ` +
        `    WHEN 'super_admin' THEN 'administrator' ` +
        `    WHEN 'team_admin' THEN 'administrator' ` +
        `    ELSE "role"::text ` +
        `  END` +
        `)::"user_role_enum_old"`,
    );

    // 3) 新 enum 型を破棄し、旧型を正式名称へリネームする。
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
    await queryRunner.query(
      `ALTER TYPE "user_role_enum_old" RENAME TO "user_role_enum"`,
    );
  }
}
