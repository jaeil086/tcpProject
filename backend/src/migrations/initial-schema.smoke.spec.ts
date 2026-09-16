import 'reflect-metadata';
import { DataSource, QueryFailedError } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { buildTypeOrmOptions } from '../config/typeorm.config';
import { InitialSchema1717000000000 } from './1717000000000-InitialSchema';

/**
 * エンティティ／マイグレーションのスモークテスト（要件 2.7）。
 *
 * 目的（一度きりの構成確認。property テストではない）:
 *  1. 初期スキーマのマイグレーション（InitialSchema1717000000000）がテスト用 DB に
 *     問題なく適用できること。
 *  2. schedule (user_id, date) の複合一意制約（uq_schedule_user_date）が実際に効くこと。
 *     同一ユーザー・同一日に 2 件目の予定を挿入すると DB エラーで拒否される。
 *
 * 実行方針:
 *  - 実 PostgreSQL に対して実行する。接続先は TEST_DATABASE_* / DATABASE_* の環境変数、
 *    未指定時は docker-compose.yml の既定値（localhost:5432 の teamapp）を用いる。
 *  - DB へ接続できない環境では CI/ローカルを問わずテストをスキップし、実行手順を案内する
 *    （破壊的な失敗にはしない）。ローカルでは `docker compose up -d postgres` で起動できる。
 *  - テスト後はマイグレーションの down() でスキーマを元に戻し、副作用を残さない。
 */

// テスト用の接続オプション。TEST_DATABASE_* を優先し、なければ DATABASE_* / 既定値を使う。
function buildTestDataSource(): DataSource {
  // buildTypeOrmOptions() は常に postgres 用オプションを返すため型を絞り込む。
  const base = buildTypeOrmOptions() as PostgresConnectionOptions;
  return new DataSource({
    ...base,
    host: process.env.TEST_DATABASE_HOST ?? base.host,
    port: Number(process.env.TEST_DATABASE_PORT ?? base.port),
    username: process.env.TEST_DATABASE_USER ?? base.username,
    password: process.env.TEST_DATABASE_PASSWORD ?? base.password,
    database: process.env.TEST_DATABASE_NAME ?? base.database,
    // スモークテストではマイグレーションを手動で up()/down() 実行するため自動実行は無効
    migrationsRun: false,
    synchronize: false,
    logging: false,
  });
}

// DB へ接続できるかを事前に確認する。接続不可なら理由を返してテストをスキップする。
async function tryConnect(dataSource: DataSource): Promise<string | null> {
  try {
    await dataSource.initialize();
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message;
  }
}

describe('InitialSchema マイグレーションのスモークテスト（要件 2.7）', () => {
  const dataSource = buildTestDataSource();
  let skipReason: string | null = null;

  beforeAll(async () => {
    // まず接続を試みる。失敗した場合はスキップ理由を記録する。
    skipReason = await tryConnect(dataSource);
    if (skipReason) {
      // 接続できない環境では実行手順を明示してスキップする。
      // eslint-disable-next-line no-console
      console.warn(
        [
          '[smoke] テスト用 PostgreSQL に接続できないためスキップします。',
          `[smoke] 接続エラー: ${skipReason}`,
          '[smoke] ローカルで実行するには次のいずれかで PostgreSQL を用意してください:',
          '[smoke]   - リポジトリ直下で `docker compose up -d postgres`',
          '[smoke]   - もしくは TEST_DATABASE_HOST 等の環境変数で接続先を指定',
        ].join('\n'),
      );
      return;
    }

    // クリーンな状態から適用するため、既存スキーマがあれば先に落としておく。
    const runner = dataSource.createQueryRunner();
    try {
      const migration = new InitialSchema1717000000000();
      // 既にテーブルが残っている場合に備えて down() を試行（存在しなければ無視）。
      await migration.down(runner).catch(() => undefined);
      // マイグレーションを適用（= 1 の確認: 例外なく適用できること）。
      await migration.up(runner);
    } finally {
      await runner.release();
    }
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

  it('マイグレーションが適用され、必要なテーブルと複合一意制約が作成される', async () => {
    if (skipReason) {
      return; // 接続不可のためスキップ（beforeAll で案内済み）
    }

    // 主要テーブルが作成されていることを確認する（= 1 の確認）。
    const tables: Array<{ table_name: string }> = await dataSource.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('team', 'user', 'schedule', 'threshold_setting')`,
    );
    const tableNames = tables.map((row) => row.table_name).sort();
    expect(tableNames).toEqual([
      'schedule',
      'team',
      'threshold_setting',
      'user',
    ]);

    // schedule (user_id, date) の複合一意制約が存在することを確認する（= 2 の下準備）。
    const constraints: Array<{ constraint_name: string }> = await dataSource.query(
      `SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'schedule'
          AND constraint_type = 'UNIQUE'`,
    );
    const constraintNames = constraints.map((row) => row.constraint_name);
    expect(constraintNames).toContain('uq_schedule_user_date');
  });

  it('同一ユーザー・同一日の予定を 2 件挿入すると複合一意制約で拒否される', async () => {
    if (skipReason) {
      return; // 接続不可のためスキップ
    }

    // 予定の親となるユーザーを 1 件作成する。
    const userRows: Array<{ id: string }> = await dataSource.query(
      `INSERT INTO "user" ("cognito_sub", "email", "name", "role")
       VALUES ($1, $2, $3, 'employee') RETURNING "id"`,
      ['smoke-sub-001', 'smoke-001@example.com', 'スモーク太郎'],
    );
    const userId = userRows[0].id;
    const targetDate = '2025-01-06'; // 対象日（同一日を 2 回使う）

    // 1 件目の挿入は成功する。
    await dataSource.query(
      `INSERT INTO "schedule" ("user_id", "date", "work_location")
       VALUES ($1, $2, 'office')`,
      [userId, targetDate],
    );

    // 2 件目（同一 user_id・同一 date）は複合一意制約で拒否されなければならない。
    await expect(
      dataSource.query(
        `INSERT INTO "schedule" ("user_id", "date", "work_location")
         VALUES ($1, $2, 'remote')`,
        [userId, targetDate],
      ),
    ).rejects.toThrow(QueryFailedError);

    // 別の日付であれば同一ユーザーでも挿入できること（制約が日付単位であることの確認）。
    await expect(
      dataSource.query(
        `INSERT INTO "schedule" ("user_id", "date", "work_location")
         VALUES ($1, $2, 'remote')`,
        [userId, '2025-01-07'],
      ),
    ).resolves.toBeDefined();
  });
});
