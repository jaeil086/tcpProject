import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 認証方式を Cognito から自前管理（bcrypt + 自己発行 JWT）へ移行するためのスキーマ変更。
 *
 * 変更内容:
 *  - user テーブルに password_hash カラム（bcrypt ハッシュ格納用）を追加する。
 *    既存行を壊さないため NULL 許容とする（新規登録ユーザーでは必ず設定する）。
 *  - user.cognito_sub の NOT NULL 制約を解除する。
 *    新方式では Cognito を利用しないため、新規ユーザーでは NULL となる。
 *    既存行には値が残る可能性があるため一意制約（uq_user_cognito_sub）は維持する。
 *
 * InitialSchema（1717000000000）より後に適用されるよう、タイムスタンプを繰り上げている。
 */
export class AddPasswordHashAndNullableCognitoSub1717000001000
  implements MigrationInterface
{
  name = 'AddPasswordHashAndNullableCognitoSub1717000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // password_hash カラムを追加（bcrypt ハッシュ。既存行があるため NULL 許容）
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "password_hash" character varying(255)`,
    );

    // cognito_sub の NOT NULL 制約を解除（新方式では利用しないため）
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "cognito_sub" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // up() と対称に巻き戻す。
    // 注意: cognito_sub に NULL 値を持つ行が存在する場合、NOT NULL への復帰は失敗する。
    //       これは新方式で登録されたユーザーが存在する場合に起こり得るが、
    //       マイグレーションの対称性を保つためそのまま復帰させる（許容）。
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "cognito_sub" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "password_hash"`,
    );
  }
}
