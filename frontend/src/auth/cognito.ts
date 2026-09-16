// Feature: ai-team-planner
// 認証の委譲方針とトークン保管ヘルパー（要件 1.2、1.6、1.7）。
//
// 設計方針:
// - 本システムの認証は AWS Cognito に委譲する。ただしフロントエンドは Cognito SDK を直接
//   呼ばず、バックエンドの /auth エンドポイント（/auth/login・/auth/logout・/auth/me）経由で
//   認証を行う。バックエンドが Cognito との通信・JWT 検証・ロックアウト判定を担う。
// - したがって本モジュールに Cognito SDK 依存は追加しない。ここではアクセストークンの
//   localStorage 永続化に関する薄いヘルパーのみを提供し、状態管理の本体は AuthProvider が担う。
// - 保管キーは api クライアントと共有する（ACCESS_TOKEN_STORAGE_KEY）。これにより
//   未ログイン時の既定トークンプロバイダ（localStorage 読み取り）とも整合する。

import { ACCESS_TOKEN_STORAGE_KEY } from '../api/client';

/**
 * localStorage からアクセストークンを取得する。
 * window/localStorage が無い環境や未ログイン時は null を返す。
 */
export function getStoredToken(): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

/**
 * アクセストークンを localStorage に保存する（ログイン成功時）。
 */
export function storeToken(token: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
}

/**
 * 保存済みのアクセストークンを削除する（ログアウト時・トークン失効検出時）。
 */
export function clearStoredToken(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}
