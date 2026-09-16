// Feature: ai-team-planner
// カレンダー（CalendarModule）およびチーム（TeamsModule）関連の API 呼び出し
// （要件 3.1〜3.4、3.6）。

import { apiClient } from './client';
import type { CalendarQuery, CalendarResponse, Team } from '../types';

/**
 * GET /calendar?teamId=&weekStart=
 * 指定チーム（未指定時は自チーム）の週次勤務予定と日別 Occupancy_Count を返す
 * （要件 3.1〜3.4、3.6）。
 */
export function getCalendar(params: CalendarQuery = {}): Promise<CalendarResponse> {
  return apiClient.get<CalendarResponse>('/calendar', {
    teamId: params.teamId,
    weekStart: params.weekStart,
  });
}

/**
 * GET /teams
 * チーム一覧を返す（要件 3.3、3.4）。
 */
export function getTeams(): Promise<Team[]> {
  return apiClient.get<Team[]>('/teams');
}
