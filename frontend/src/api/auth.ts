// Feature: ai-team-planner
// 認証（AuthModule）関連の API 呼び出し（要件 1.2、1.7）。

import { apiClient } from './client';
import type {
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  UserProfile,
} from '../types';

/**
 * POST /auth/login
 * メールアドレス／パスワードで Cognito 認証を行い、トークンを返す（要件 1.2）。
 */
export function login(body: LoginRequest): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>('/auth/login', body);
}

/**
 * POST /auth/logout
 * 認証済みユーザーのトークンを無効化する（要件 1.7）。
 */
export function logout(): Promise<LogoutResponse> {
  return apiClient.post<LogoutResponse>('/auth/logout');
}

/**
 * GET /auth/me
 * ログイン中ユーザーのプロフィール（ロール・所属チーム含む）を返す。
 */
export function getMe(): Promise<UserProfile> {
  return apiClient.get<UserProfile>('/auth/me');
}
