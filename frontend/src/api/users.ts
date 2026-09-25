// Feature: ai-team-planner
// 管理者向けユーザー管理（Admin Users API）の API 呼び出し。
//
// 設計方針:
// - 管理者専用エンドポイント（GET /users、PUT /users/:id/team、PUT /users/:id/role）を
//   薄くラップする。呼び出し側（管理画面）はロール変更・チーム割り当てのみを扱う。
// - 更新系は変更後の AdminUserView を返し、UI 側で該当行を差し替えられるようにする。

import { apiClient } from './client';
import type { AdminUserView, UserRole } from '../types';

/**
 * GET /users
 * 管理対象ユーザーの一覧を返す（管理者専用）。
 */
export function listUsers(): Promise<AdminUserView[]> {
  return apiClient.get<AdminUserView[]>('/users');
}

/**
 * PUT /users/:id/team
 * 指定ユーザーの所属チームを更新する（teamId が null の場合は未所属にする）。
 *
 * @param userId 対象ユーザー ID
 * @param teamId 割り当てるチーム ID（未所属にする場合は null）
 */
export function assignTeam(userId: string, teamId: string | null): Promise<AdminUserView> {
  return apiClient.put<AdminUserView>(`/users/${userId}/team`, { teamId });
}

/**
 * PUT /users/:id/role
 * 指定ユーザーのロールを更新する。
 *
 * @param userId 対象ユーザー ID
 * @param role   変更後のロール（employee / administrator）
 */
export function updateRole(userId: string, role: UserRole): Promise<AdminUserView> {
  return apiClient.put<AdminUserView>(`/users/${userId}/role`, { role });
}
