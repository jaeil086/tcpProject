import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 勤務区分（schedule.work_location）の enum に新しい値を追加するスキーマ変更。
 *
 * 変更前: schedule_work_location_enum = ('office', 'remote')
 * 変更後: schedule_work_location_enum = ('office', 'remote', 'aoyama', 'other', 'vacation')
 *
 * 追加する値:
 *  - aoyama   … 本社（青山）への出社。
 *  - other    … その他（研修・外出など）。
 *  - vacation … 休暇。
 *
 * PostgreSQL では既存の enum 型へ値を追加する場合 ALTER TYPE ... ADD VALUE を用いる。
 * IF NOT EXISTS を付与して冪等性を確保する（再実行・部分適用でも失敗しない）。
 *
 * 注意（down の制約）:
 *  PostgreSQL は enum からの値（ラベル）の直接削除をサポートしない。
 *  そのため down() では「新しい enum 型を作り直して列を付け替える」方式で巻き戻す。
 *  追加した値（aoyama/other/vacation）を使用している行が存在する場合、
 *  旧 2 値へはキャストできないため down は失敗する（データ損失を避けるための意図的な挙動）。
 *  巻き戻しが必要な場合は、事前に該当行の work_location を office/remote へ更新すること。
 */
export class AddWorkLocationValues1717000004000 implements MigrationInterface {
  name = 'AddWorkLocationValues1717000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // enum へ新しい値を追加する（冪等）。
    await queryRunner.query(
      `ALTER TYPE "schedule_work_location_enum" ADD VALUE IF NOT EXISTS 'aoyama'`,
    );
    await queryRunner.query(
      `ALTER TYPE "schedule_work_location_enum" ADD VALUE IF NOT EXISTS 'other'`,
    );
    await queryRunner.query(
      `ALTER TYPE "schedule_work_location_enum" ADD VALUE IF NOT EXISTS 'vacation'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1) 旧い 2 値の enum 型を作成する。
    await queryRunner.query(
      `CREATE TYPE "schedule_work_location_enum_old" AS ENUM ('office', 'remote')`,
    );

    // 2) work_location 列を旧型へ戻す。
    //    追加値（aoyama/other/vacation）を使う行が存在するとキャストに失敗する。
    //    これは意図的で、巻き戻し前に該当行を office/remote へ寄せる運用を促す。
    await queryRunner.query(
      `ALTER TABLE "schedule" ALTER COLUMN "work_location" TYPE "schedule_work_location_enum_old" ` +
        `USING ("work_location"::text::"schedule_work_location_enum_old")`,
    );

    // 3) 新 enum 型を破棄し、旧型を正式名称へリネームする。
    await queryRunner.query(`DROP TYPE "schedule_work_location_enum"`);
    await queryRunner.query(
      `ALTER TYPE "schedule_work_location_enum_old" RENAME TO "schedule_work_location_enum"`,
    );
  }
}
