// Feature: ai-team-planner
// 勤務予定（ScheduleModule）関連の API 呼び出し（要件 2.1、2.4、2.6）。

import { apiClient } from './client';
import type {
  UpsertScheduleRequest,
  UpsertScheduleResponse,
  WeekSchedule,
} from '../types';

/**
 * GET /schedules/me?weekStart=
 * 自身の Target_Week 平日 5 日分（未登録を含む）を返す（要件 2.6）。
 * weekStart 省略時はサーバー現在日から翌週を対象とする。
 */
export function getMySchedule(weekStart?: string): Promise<WeekSchedule> {
  return apiClient.get<WeekSchedule>('/schedules/me', { weekStart });
}

/**
 * PUT /schedules/me
 * 自身の特定日の勤務予定を登録／更新（upsert）する（要件 2.1、2.4）。
 */
export function upsertMySchedule(
  body: UpsertScheduleRequest,
): Promise<UpsertScheduleResponse> {
  return apiClient.put<UpsertScheduleResponse>('/schedules/me', body);
}
