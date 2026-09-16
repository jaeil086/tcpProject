// Feature: ai-team-planner
// AnalysisEvaluator: 日別 Occupancy_Count としきい値設定から、出社人員の過多／過少警告と
// 日別の勤務パターン要約を生成する純粋関数モジュール（要件 5.2、5.3、5.4）。
//
// 設計方針:
// - 副作用を持たない（DB・外部 API・現在時刻の暗黙参照なし）純粋 TS として実装し、
//   NestJS などのフレームワーク依存を持たない。これによりタスク 4.11・4.12 の
//   property テストが容易に書けるようにする。
// - 集計は OccupancyCalculator（occupancy.ts）の純粋関数を再利用し、
//   Occupancy_Count（当日 office 登録者数）・在宅人数の数え方を二重管理しない。
// - 設計書 Data Models の AnalysisWarning / DailyPatternSummary の形状に一致させる。
//   ただし AnalysisResult 全体（generatedAt: Date や targetWeekStart のラップ）は
//   現在時刻に依存し非決定的になるため、本純粋コアでは扱わない。
//   generatedAt・targetWeekStart の付与はサービス層（タスク 10）が担う。
//   本モジュールは (schedules, dates, thresholds) から { warnings, summary } を
//   決定的に返すことに専念する。
//
// 用語（glossary）:
// - Occupancy_Count: ある日に Work_Location = office を登録したメンバーの人数（要件 3.2、4.1）。
// - Upper_Threshold: 出社人員過多の判定に用いる上限値。
// - Lower_Threshold: 出社人員過少の判定に用いる下限値。
//
// 警告判定ルール（要件 5.2、5.3、設計書 Property 11 に対応）:
// - 各対象日について occupancyCount = 当日の Occupancy_Count（office 登録者数）を求める。
// - occupancyCount >= upperThreshold のとき、当該日を「出社人員過多」として
//   over_capacity 警告を生成する（要件 5.2「Upper_Threshold 以上」）。
// - occupancyCount <= lowerThreshold のとき、当該日を「出社人員過少」として
//   under_capacity 警告を生成する（要件 5.3「Lower_Threshold 以下」）。
// - いずれの条件も満たさない日には警告を生成しない。
// - 各警告メッセージには対象日付と当該 occupancyCount を必ず含める（要件 5.2、5.3）。
//
// 両条件の同時成立について（重要な境界の扱い）:
// - ThresholdValidator（threshold.ts）が保証する妥当なしきい値は upper > lower である。
//   このとき occupancyCount >= upper ならば occupancyCount > lower となり、
//   「<= lower」は成立しない。逆に occupancyCount <= lower ならば
//   occupancyCount < upper となり「>= upper」は成立しない。
//   したがって妥当なしきい値の下では、同一日に過多と過少が同時に成立することはなく、
//   1 日あたり生成される警告は高々 1 件である。
// - 退化した（upper <= lower の）しきい値が渡された場合でも、本関数は各条件を
//   独立に評価し、両方満たす日には over_capacity と under_capacity の両方を
//   決定的に生成する（例外を投げたり優先順位で握りつぶしたりしない）。
//   しきい値の妥当性検証は ThresholdValidator の責務であり、本モジュールは
//   与えられたしきい値をそのまま判定に用いる。
//
// パターン要約ルール（要件 5.4、設計書 Property 12 に対応）:
// - 入力 dates（Target_Week の 7 日分など）すべてについて、当該日の
//   officeCount（office 登録者数）と remoteCount（remote 登録者数）を持つ
//   DailyPatternSummary を、入力 dates と同じ順序で生成する。
// - 未登録日（当日レコードが 0 件）でも {officeCount: 0, remoteCount: 0} の
//   エントリを必ず含め、全対象日を網羅する。

import { ScheduleRecord, computeDailyRates } from './occupancy';

/**
 * 出社人員の過多／過少警告（設計書 Data Models の AnalysisWarning に一致）。
 */
export interface AnalysisWarning {
  /** 対象日（'YYYY-MM-DD'）。 */
  date: string;
  /** 警告種別。over_capacity（過多）／ under_capacity（過少）。 */
  type: 'over_capacity' | 'under_capacity';
  /** 該当日の Occupancy_Count（出社人員数）。 */
  occupancyCount: number;
  /** 警告メッセージ（日本語）。対象日付と occupancyCount を含む。 */
  message: string;
}

/**
 * 日別の勤務パターン要約（設計書 Data Models の DailyPatternSummary に一致）。
 */
export interface DailyPatternSummary {
  /** 対象日（'YYYY-MM-DD'）。 */
  date: string;
  /** 当日 office を登録したメンバー数（出社人数）。 */
  officeCount: number;
  /** 当日 remote を登録したメンバー数（在宅人数）。 */
  remoteCount: number;
}

/**
 * 警告判定に用いるしきい値設定。
 * 妥当性（0〜100 の整数、upper > lower）の検証は ThresholdValidator の責務であり、
 * 本モジュールは与えられた値をそのまま判定に用いる。
 */
export interface AnalysisThresholds {
  /** 出社上限しきい値（Upper_Threshold）。 */
  upperThreshold: number;
  /** 出社下限しきい値（Lower_Threshold）。 */
  lowerThreshold: number;
}

/**
 * AnalysisEvaluator の純粋コアの返却値。
 * generatedAt / targetWeekStart のラップはサービス層（タスク 10）が付与する。
 */
export interface AnalysisEvaluation {
  /** 生成された過多／過少警告の一覧。 */
  warnings: AnalysisWarning[];
  /** 全対象日を網羅する日別パターン要約。 */
  summary: DailyPatternSummary[];
}

/**
 * 日別 Occupancy_Count としきい値から、過多／過少警告と勤務パターン要約を生成する純粋関数。
 *
 * - warnings: 各対象日について occupancyCount を求め、
 *   occupancyCount >= upperThreshold なら over_capacity、
 *   occupancyCount <= lowerThreshold なら under_capacity の警告を生成する。
 *   いずれも満たさない日には警告を生成しない。各メッセージには対象日付と
 *   occupancyCount を含める（要件 5.2、5.3）。
 * - summary: 入力 dates すべてについて officeCount / remoteCount を持つ要約を
 *   入力順で生成する（要件 5.4）。
 *
 * @param schedules 勤務予定レコードの集合
 * @param dates 対象日の配列（'YYYY-MM-DD' の並び。Target_Week の 7 日分など）
 * @param thresholds 警告判定に用いるしきい値設定
 * @returns 生成された警告一覧と全対象日を網羅する日別パターン要約
 */
export function evaluateAnalysis(
  schedules: readonly ScheduleRecord[],
  dates: readonly string[],
  thresholds: AnalysisThresholds,
): AnalysisEvaluation {
  const { upperThreshold, lowerThreshold } = thresholds;

  const warnings: AnalysisWarning[] = [];
  const summary: DailyPatternSummary[] = [];

  for (const date of dates) {
    // 当日の集計を 1 度だけ行い、Occupancy_Count と在宅人数を取得する。
    const rates = computeDailyRates(schedules, date);
    const occupancyCount = rates.officeCount; // = Occupancy_Count（当日 office 登録者数）

    // --- 警告生成（要件 5.2、5.3） ---
    // 過多: occupancyCount >= Upper_Threshold。
    if (occupancyCount >= upperThreshold) {
      warnings.push({
        date,
        type: 'over_capacity',
        occupancyCount,
        // メッセージには対象日付と occupancyCount を含める。
        message: `${date} は出社人員過多です（出社人員数: ${occupancyCount} 人、上限しきい値: ${upperThreshold} 人以上）。`,
      });
    }

    // 過少: occupancyCount <= Lower_Threshold。
    // 妥当なしきい値（upper > lower）では過多と同時には成立しないが、
    // 退化したしきい値でも各条件を独立に評価する（両方を決定的に生成し得る）。
    if (occupancyCount <= lowerThreshold) {
      warnings.push({
        date,
        type: 'under_capacity',
        occupancyCount,
        message: `${date} は出社人員過少です（出社人員数: ${occupancyCount} 人、下限しきい値: ${lowerThreshold} 人以下）。`,
      });
    }

    // --- パターン要約（要件 5.4） ---
    // 未登録日も含め、全対象日を入力順で網羅する。
    summary.push({
      date,
      officeCount: rates.officeCount,
      remoteCount: rates.remoteCount,
    });
  }

  return { warnings, summary };
}
