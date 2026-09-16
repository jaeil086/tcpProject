// Feature: ai-team-planner
// AI 分析（AnalysisModule）関連の API 呼び出し（要件 5.1〜5.4、5.6）。

import { apiClient } from './client';
import type { AnalysisRunResponse } from '../types';

/**
 * POST /analysis/run?weekStart=
 * Target_Week を対象に AI 分析を実行し、過多／過少警告とパターン要約を返す
 * （要件 5.1〜5.4、5.6）。対象データが 0 件の場合は hasData=false のメッセージを返す。
 */
export function runAnalysis(weekStart?: string): Promise<AnalysisRunResponse> {
  return apiClient.post<AnalysisRunResponse>('/analysis/run', undefined, { weekStart });
}
