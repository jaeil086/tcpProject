// Feature: ai-team-planner
// OccupancyCalculator: 勤務予定集合から、日別 Occupancy_Count（当日 office 登録者数）と
// 出社率・在宅率を算出する純粋関数モジュール（要件 3.2、4.1、4.5）。
//
// 設計方針:
// - 副作用を持たない（DB・外部 API・現在時刻の暗黙参照なし）純粋 TS として実装し、
//   NestJS などのフレームワーク依存を持たない。これによりタスク 4.6・4.7 の
//   property テストが容易に書けるようにする。
// - 勤務区分の許容値は enums.ts の WorkLocation（office / remote）を唯一の情報源とし、
//   本モジュール内で enum を再定義しない（表記の二重管理を避ける）。
// - 入力は TypeORM の Schedule エンティティに直接依存せず、テスト容易性のため
//   最小限のプレーンな形状（ScheduleRecord）を受け取る。
//
// 用語（glossary）:
// - Occupancy_Count: ある日に Work_Location = office を登録したメンバーの人数（要件 3.2、4.1）。
// - total: ある日に勤務予定（office または remote のいずれか）を登録したメンバー数。
//   未登録のメンバーは total に含めない。
//
// 丸め（rounding）に関する決定（要件 4.5、Property 8 に対応）:
// - 出社率・在宅率は 0〜100 の百分率で表す。
// - Property 8 は「total >= 1 のとき 出社率 + 在宅率 === 100」を要求する。
// - 勤務区分はちょうど 2 値（office / remote）であり、当日登録者について
//   total = officeCount + remoteCount が常に成立する。
// - 個別に丸めると合計が 100 を割る恐れがあるため、
//   officeRate = officeCount / total * 100 を算出したうえで、
//   remoteRate = 100 - officeRate として求める。これにより浮動小数の
//   端数によらず、合計が厳密に 100 になることを保証する。
// - total === 0（当日の登録者が 0 人）の境界では 0 除算を避けるため、
//   officeRate・remoteRate をともに 0 と定義する。この場合は合計が 100 に
//   ならないが、Property 8 は total >= 1 のときのみ合計 100 を要求するため矛盾しない。

import { WorkLocation } from '../entities/enums';

/**
 * 勤務予定 1 件分の最小形状（TypeORM エンティティから切り離したプレーン型）。
 * 集計に必要な項目のみを持ち、テスト時に容易に生成できるようにする。
 */
export interface ScheduleRecord {
  /** 登録したユーザーの識別子。 */
  userId: string;
  /** 対象日（'YYYY-MM-DD' 形式）。 */
  date: string;
  /** 勤務区分（office / remote）。 */
  workLocation: WorkLocation;
}

/**
 * 日別の集計結果（Occupancy_Count と出社率・在宅率）。
 */
export interface DailyRates {
  /** 当日 office を登録したメンバー数（= Occupancy_Count）。 */
  officeCount: number;
  /** 当日 remote を登録したメンバー数。 */
  remoteCount: number;
  /** 当日に勤務予定を登録したメンバー総数（office + remote）。 */
  total: number;
  /** 出社率（0〜100）。total === 0 のときは 0。 */
  officeRate: number;
  /** 在宅率（0〜100）。total === 0 のときは 0。 */
  remoteRate: number;
}

/**
 * 日別の Occupancy_Count（office 登録者数）。
 */
export interface OccupancyByDate {
  /** 対象日（'YYYY-MM-DD'）。 */
  date: string;
  /** 当該日の Occupancy_Count（office 登録者数）。 */
  officeCount: number;
}

/**
 * 指定日について、Work_Location = office を登録したメンバー数（Occupancy_Count）を数える純粋関数。
 *
 * 同一日のレコードのみを対象とし、workLocation が office のものを数える（要件 3.2、4.1）。
 *
 * @param schedules 勤務予定レコードの集合
 * @param date 対象日（'YYYY-MM-DD'）
 * @returns 当該日の Occupancy_Count（office 登録者数）
 */
export function countOccupancy(
  schedules: readonly ScheduleRecord[],
  date: string,
): number {
  return schedules.filter(
    (record) =>
      record.date === date && record.workLocation === WorkLocation.Office,
  ).length;
}

/**
 * 指定日について、Occupancy_Count・在宅者数・登録者総数、および出社率・在宅率を算出する純粋関数。
 *
 * - officeCount: 当日 office を登録したメンバー数（= Occupancy_Count）。
 * - remoteCount: 当日 remote を登録したメンバー数。
 * - total: 当日に勤務予定を登録したメンバー総数（office + remote）。未登録者は含めない。
 * - officeRate: officeCount / total * 100（total === 0 のときは 0）。
 * - remoteRate: 100 - officeRate（total === 0 のときは 0）。
 *
 * remoteRate を減算で求めることで、出社率 + 在宅率 が厳密に 100 になることを保証する
 * （要件 4.5、Property 8）。
 *
 * @param schedules 勤務予定レコードの集合
 * @param date 対象日（'YYYY-MM-DD'）
 * @returns 当該日の集計結果
 */
export function computeDailyRates(
  schedules: readonly ScheduleRecord[],
  date: string,
): DailyRates {
  const sameDay = schedules.filter((record) => record.date === date);
  const officeCount = sameDay.filter(
    (record) => record.workLocation === WorkLocation.Office,
  ).length;
  const remoteCount = sameDay.filter(
    (record) => record.workLocation === WorkLocation.Remote,
  ).length;
  const total = officeCount + remoteCount;

  // total === 0（登録者なし）の境界では 0 除算を避け、両率を 0 とする。
  if (total === 0) {
    return {
      officeCount,
      remoteCount,
      total,
      officeRate: 0,
      remoteRate: 0,
    };
  }

  const officeRate = (officeCount / total) * 100;
  // 合計が厳密に 100 になるよう、在宅率は減算で求める。
  const remoteRate = 100 - officeRate;

  return {
    officeCount,
    remoteCount,
    total,
    officeRate,
    remoteRate,
  };
}

/**
 * 複数日（例: Target_Week の 7 日分）について、日別の Occupancy_Count を算出する純粋関数。
 * カレンダー／ダッシュボードでの日別表示に用いる。
 *
 * @param schedules 勤務予定レコードの集合
 * @param dates 対象日の配列（'YYYY-MM-DD' の並び）
 * @returns 各日の Occupancy_Count（入力 dates と同じ順序）
 */
export function computeOccupancyByDate(
  schedules: readonly ScheduleRecord[],
  dates: readonly string[],
): OccupancyByDate[] {
  return dates.map((date) => ({
    date,
    officeCount: countOccupancy(schedules, date),
  }));
}
