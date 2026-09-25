// Feature: ai-team-planner
// api モジュールの公開エントリ。共通クライアントと各エンドポイント群を再エクスポートする。

export { apiClient, ApiError, setAuthTokenGetter, ACCESS_TOKEN_STORAGE_KEY } from './client';
export type { AuthTokenGetter } from './client';

export * as authApi from './auth';
export * as usersApi from './users';
export * as schedulesApi from './schedules';
export * as calendarApi from './calendar';
export * as dashboardApi from './dashboard';
export * as analysisApi from './analysis';
