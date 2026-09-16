import { DataSourceOptions } from 'typeorm';

/**
 * TypeORM の接続設定を環境変数から構築する。
 * 既定値は docker-compose.yml の backend サービスの環境変数と一致させている。
 *
 * 本番運用では `synchronize` を無効化し、スキーマ変更はマイグレーションで管理する
 * （設計書の方針に従う）。エンティティ／マイグレーションの glob は後続タスクで
 * 追加される `entities/` `migrations/` フォルダを指す。
 */
export function buildTypeOrmOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    username: process.env.DATABASE_USER ?? 'teamapp',
    password: process.env.DATABASE_PASSWORD ?? 'teamapp_password',
    database: process.env.DATABASE_NAME ?? 'teamapp',
    // エンティティはコンパイル後の dist と ts-node 実行の双方に対応する glob を指定する
    entities: [__dirname + '/../entities/**/*.entity.{ts,js}'],
    migrations: [__dirname + '/../migrations/**/*.{ts,js}'],
    // 本番ではマイグレーションでスキーマを管理するため synchronize は使用しない
    synchronize: false,
    // マイグレーションの自動実行は明示的なコマンドで行う
    migrationsRun: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
  };
}
