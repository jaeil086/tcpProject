import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 初期スキーマのマイグレーション。
 * team / user / schedule / threshold_setting の 4 テーブルと、
 * 勤務区分・ロールの enum 型、外部キー、一意制約、インデックスを作成する。
 *
 * 一意制約・インデックスの意図（要件 2.7）:
 *  - user.cognito_sub / user.email をそれぞれ一意にする
 *  - schedule (user_id, date) を複合一意にし、同一ユーザーが同一日に
 *    複数の勤務区分を持たないことを DB レベルで保証する
 *  - schedule (date) にインデックスを張り、週次集計の日付絞り込みを高速化する
 *
 * enum 型名・制約名は TypeORM のエンティティ定義と整合させ、
 * 将来のスキーマ差分検出（migration:generate）でも齟齬が出ないようにする。
 */
export class InitialSchema1717000000000 implements MigrationInterface {
  name = 'InitialSchema1717000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // UUID 生成関数 gen_random_uuid() を利用するため pgcrypto を有効化する
    // （PostgreSQL 13 以降は組み込みだが、下位バージョンとの互換のため明示的に作成する）
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // 勤務区分（office / remote）の enum 型を作成する
    await queryRunner.query(
      `CREATE TYPE "schedule_work_location_enum" AS ENUM ('office', 'remote')`,
    );

    // ユーザーのロール（employee / administrator）の enum 型を作成する
    await queryRunner.query(
      `CREATE TYPE "user_role_enum" AS ENUM ('employee', 'administrator')`,
    );

    // team テーブル
    await queryRunner.query(`
      CREATE TABLE "team" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(255) NOT NULL,
        CONSTRAINT "pk_team_id" PRIMARY KEY ("id")
      )
    `);

    // user テーブル（cognito_sub・email を一意、team_id は NULL 許容の外部キー）
    await queryRunner.query(`
      CREATE TABLE "user" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "cognito_sub" character varying(255) NOT NULL,
        "email" character varying(255) NOT NULL,
        "name" character varying(255) NOT NULL,
        "role" "user_role_enum" NOT NULL,
        "team_id" uuid,
        CONSTRAINT "pk_user_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_user_cognito_sub" UNIQUE ("cognito_sub"),
        CONSTRAINT "uq_user_email" UNIQUE ("email")
      )
    `);

    // schedule テーブル（勤務予定）
    await queryRunner.query(`
      CREATE TABLE "schedule" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "date" date NOT NULL,
        "work_location" "schedule_work_location_enum" NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_schedule_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_schedule_user_date" UNIQUE ("user_id", "date")
      )
    `);

    // schedule.date インデックス（週次集計の日付絞り込み用）
    await queryRunner.query(
      `CREATE INDEX "idx_schedule_date" ON "schedule" ("date")`,
    );

    // threshold_setting テーブル（しきい値設定）
    await queryRunner.query(`
      CREATE TABLE "threshold_setting" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "upper_threshold" integer NOT NULL,
        "lower_threshold" integer NOT NULL,
        "updated_by" uuid NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_threshold_setting_id" PRIMARY KEY ("id")
      )
    `);

    // 外部キー: user.team_id -> team.id（NULL 許容）
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD CONSTRAINT "fk_user_team"
      FOREIGN KEY ("team_id") REFERENCES "team" ("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // 外部キー: schedule.user_id -> user.id（ユーザー削除時は予定も削除）
    await queryRunner.query(`
      ALTER TABLE "schedule"
      ADD CONSTRAINT "fk_schedule_user"
      FOREIGN KEY ("user_id") REFERENCES "user" ("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // 外部キー: threshold_setting.updated_by -> user.id
    await queryRunner.query(`
      ALTER TABLE "threshold_setting"
      ADD CONSTRAINT "fk_threshold_setting_updated_by"
      FOREIGN KEY ("updated_by") REFERENCES "user" ("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // up() と逆順で依存関係を解消しながら削除する
    await queryRunner.query(
      `ALTER TABLE "threshold_setting" DROP CONSTRAINT "fk_threshold_setting_updated_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schedule" DROP CONSTRAINT "fk_schedule_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "fk_user_team"`,
    );

    await queryRunner.query(`DROP TABLE "threshold_setting"`);
    await queryRunner.query(`DROP INDEX "idx_schedule_date"`);
    await queryRunner.query(`DROP TABLE "schedule"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TABLE "team"`);

    await queryRunner.query(`DROP TYPE "user_role_enum"`);
    await queryRunner.query(`DROP TYPE "schedule_work_location_enum"`);
  }
}
