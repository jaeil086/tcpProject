// Feature: ai-team-planner
// ダッシュボード（DashboardModule）関連の API 呼び出し（要件 4.1、4.3〜4.7）。
// これらは管理者（Administrator）専用エンドポイントである（RolesGuard により保護）。

import { apiClient } from './client';
import type { Attendees, DashboardOccupancy, Threshold } from '../types';

/**
 * GET /dashboard/occupancy?weekStart=
 * 組織全体の日別 Occupancy_Count・出社率・在宅率を返す（要件 4.1、4.5）。
 */
export function getDashboardOccupancy(weekStart?: string): Promise<DashboardOccupancy> {
  return apiClient.get<DashboardOccupancy>('/dashboard/occupancy', { weekStart });
}

/**
 * GET /dashboard/attendees?date=
 * 指定日の出社者一覧を返す（要件 4.6、4.7）。
 */
export function getAttendees(date: string): Promise<Attendees> {
  return apiClient.get<Attendees>('/dashboard/attendees', { date });
}

/**
 * GET /dashboard/threshold
 * 現在のしきい値設定を返す（要件 4.3）。
 */
export function getThreshold(): Promise<Threshold> {
  return apiClient.get<Threshold>('/dashboard/threshold');
}

/**
 * PUT /dashboard/threshold
 * しきい値を更新する。不正時はバックエンドが既存値を保持し ApiError を返す（要件 4.4）。
 */
export function updateThreshold(body: Threshold): Promise<Threshold> {
  return apiClient.put<Threshold>('/dashboard/threshold', body);
}
