import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './config/typeorm.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TeamsModule } from './teams/teams.module';
import { ScheduleModule } from './schedule/schedule.module';
import { CalendarModule } from './calendar/calendar.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AnalysisModule } from './analysis/analysis.module';

/**
 * ルートモジュール。
 * - ConfigModule: 環境変数の読み込みをアプリ全体で有効化する
 * - TypeOrmModule: PostgreSQL への接続を設定する（接続情報は環境変数由来）
 * - CommonModule: 認証・認可の DI 対象（CognitoTokenVerifier / 各ガード）を提供する
 * - HttpExceptionFilter: APP_FILTER として登録し、全例外を統一エラー応答へ変換する
 * - AuthModule: POST /auth/login・POST /auth/logout・GET /auth/me を提供する
 * - UsersModule: cognitoSub とアプリユーザーの紐付け・プロフィール解決を提供する
 * - TeamsModule: GET /teams（チーム一覧）とチーム別メンバー取得を提供する
 * - ScheduleModule: PUT/GET /schedules/me（勤務予定の登録・更新・照会）を提供する
 * - CalendarModule: GET /calendar（チーム週次勤務予定の集約・Occupancy_Count）を提供する
 * - DashboardModule: GET /dashboard/occupancy・/attendees、GET/PUT /dashboard/threshold を提供する
 * - AnalysisModule: POST /analysis/run（AI 分析実行）を提供する
 */
@Module({
  imports: [
    // 環境変数をグローバルに利用可能にする
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // TypeORM の PostgreSQL 接続設定を組み込む
    TypeOrmModule.forRoot(buildTypeOrmOptions()),
    // 認証・認可の共通基盤（ガード・トークン検証器）
    CommonModule,
    // 認証エンドポイント（/auth/login, /auth/logout, /auth/me）
    AuthModule,
    // ユーザー照会（サービスのみ）
    UsersModule,
    // チーム照会（GET /teams）
    TeamsModule,
    // 勤務予定の登録・更新・照会（PUT/GET /schedules/me）
    ScheduleModule,
    // チーム週次カレンダー集約（GET /calendar）
    CalendarModule,
    // 管理者ダッシュボード集計・しきい値管理（GET /dashboard/*・PUT /dashboard/threshold）
    DashboardModule,
    // AI 分析実行（POST /analysis/run）
    AnalysisModule,
  ],
  controllers: [],
  providers: [
    // 統一エラー応答を返すグローバル例外フィルタ
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
