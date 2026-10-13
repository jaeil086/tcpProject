// Feature: ai-team-planner
// チーム（TeamsModule）関連の API 呼び出しを集約する。
//
// 設計方針:
// - チームの取得（GET /teams）と作成（POST /teams）を一箇所にまとめ、
//   チーム操作の追加に備える。GET /teams は calendarApi.getTeams と重複するが、
//   既存利用を壊さないため calendar 側は温存し、本モジュールを新設して集約する。
// - 作成系は返却された TeamSummary（Team）を返し、UI 側で一覧へ反映できるようにする。

import { apiClient } from './client';
import type { Team } from '../types';

/**
 * GET /teams
 * チーム一覧（リーダー情報付き）を返す。
 */
export function getTeams(): Promise<Team[]> {
  return apiClient.get<Team[]>('/teams');
}

/**
 * POST /teams
 * チームを新規作成する（管理者専用）。現在の管理者がリーダーとして設定される。
 *
 * @param name 作成するチーム名
 * @returns 作成されたチーム（リーダー情報付き）
 */
export function createTeam(name: string): Promise<Team> {
  return apiClient.post<Team>('/teams', { name });
}

/**
 * DELETE /teams/:id
 * チームを削除する（最上位管理者専用）。所属メンバーはサーバー側で未所属へ退避される。
 * 成功時は 204 No Content（本関数は void を返す）。
 *
 * @param id 削除するチームの ID
 */
export function deleteTeam(id: string): Promise<void> {
  return apiClient.delete<void>(`/teams/${id}`);
}
