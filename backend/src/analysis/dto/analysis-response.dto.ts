/**
 * AI 分析 API のレスポンス DTO（AnalysisModule、要件 5.1〜5.4、5.6）。
 *
 * 分析は組織全体（全チーム横断）の Target_Week（翌週の月〜日 7 日分）を対象とし、
 * 出社人員の過多／過少警告と日別の勤務パターン要約を返す。
 * 警告・要約の型は純粋ドメイン（AnalysisEvaluator）の AnalysisWarning /
 * DailyPatternSummary を再利用し、形状の二重管理を避ける。
 */
import {
  AnalysisWarning,
  DailyPatternSummary,
} from '../../domain/analysis-eval';

/**
 * POST /analysis/run のレスポンス（要件 5.1〜5.4、5.6）。
 *
 * - hasData=true: 対象週に勤務予定が存在し、警告・要約を生成した通常ケース。
 *   warnings / summary に生成結果を格納し、generatedAt に生成時刻を設定する。
 * - hasData=false: 対象週の勤務予定が 0 件のケース（要件 5.6）。
 *   分析対象データが存在しない旨を message に設定し、warnings / summary は空配列とする。
 */
export interface AnalysisRunResponse {
  /** Target_Week の起点日（翌週の月曜、YYYY-MM-DD）。 */
  targetWeekStart: string;
  /** 分析対象の勤務予定が存在したかどうか（false の場合は要件 5.6 の対象なしケース）。 */
  hasData: boolean;
  /** 対象データが存在しない旨のメッセージ（hasData=false のときのみ設定。要件 5.6）。 */
  message?: string;
  /** 分析結果の生成時刻（ISO 8601 文字列。hasData=false のときは未設定）。 */
  generatedAt?: string;
  /** 出社人員の過多／過少警告の一覧（要件 5.2、5.3。hasData=false のときは空配列）。 */
  warnings: AnalysisWarning[];
  /** 全対象日を網羅する日別パターン要約（要件 5.4。hasData=false のときは空配列）。 */
  summary: DailyPatternSummary[];
}
