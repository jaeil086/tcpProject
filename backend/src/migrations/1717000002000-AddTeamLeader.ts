import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * チームにリーダー（作成者）情報を保持するためのスキーマ変更。
 *
 * 変更内容:
 *  - team テーブルに leader_id カラム（チームを作成した管理者の id 格納用）を追加する。
 *    既存行を壊さないため NULL 許容とする。
 *  - leader_id に対して user(id) を参照する外部キー制約（fk_team_leader）を追加する。
 *    参照先ユーザー削除時はリーダー情報を失っても整合性を保てるよう
 *    ON DELETE SET NULL とする。
 *
 * InitialSchema（1717000000000）および AddPasswordHashAndNullableCognitoSub
 * （1717000001000）より後に適用されるよう、タイムスタンプを繰り上げている。
 */
export class AddTeamLeader1717000002000 implements MigrationInterface {
  name = 'AddTeamLeader1717000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // leader_id カラムを追加（チーム作成者の id。既存行があるため NULL 許容）
    await queryRunner.query(
      `ALTER TABLE "team" ADD COLUMN "leader_id" uuid`,
    );

    // user(id) を参照する外部キー制約を追加（削除時は NULL 化）
    await queryRunner.query(
      `ALTER TABLE "team" ADD CONSTRAINT "fk_team_leader" ` +
        `FOREIGN KEY ("leader_id") REFERENCES "user"("id") ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // up() と対称に巻き戻す（先に外部キー、次にカラムを削除）。
    await queryRunner.query(
      `ALTER TABLE "team" DROP CONSTRAINT "fk_team_leader"`,
    );

    await queryRunner.query(
      `ALTER TABLE "team" DROP COLUMN "leader_id"`,
    );
  }
}
