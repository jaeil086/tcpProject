import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from './config/typeorm.config';

/**
 * TypeORM CLI（マイグレーション生成・実行）が参照する DataSource。
 * アプリ本体（app.module.ts）と同一の接続設定を共有する。
 */
const AppDataSource = new DataSource(buildTypeOrmOptions());

export default AppDataSource;
