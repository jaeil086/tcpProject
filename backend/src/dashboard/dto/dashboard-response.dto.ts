/**
 * ダッシュボード API のレスポンス DTO 群（DashboardModule、要件 4.1、4.3、4.5〜4.7）。
 *
 * いずれも組織全体（全チーム横断）の集計を対象とする（設計書 DashboardModule）。
 */

/**
 * GET /dashboard/occupancy の 1 日分の集計エントリ（要件 4.1、4.5）。
 * OccupancyCalculator（computeDailyRates）の算出結果をそのまま反映する。
 */
export interface DashboardDailyOccupancy {
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** 当日 office を登録したメンバー数（= Occupancy_Count） */
  officeCount: number;
  /** 当日 remote を登録したメンバー数 */
  remoteCount: number;
  /** 当日に勤務予定を登録したメンバー総数（office + remote） */
  total: number;
  /** 出社率（0〜100）。total === 0 のときは 0 */
  officeRate: number;
  /** 在宅率（0〜100）。total === 0 のときは 0 */
  remoteRate: number;
}

/**
 * GET /dashboard/occupancy のレスポンス（要件 4.1、4.5）。
 * Target_Week の平日 5 日分を並び順どおりに返す。
 */
export interface DashboardOccupancyResponse {
  /** Target_Week の起点日（翌週の月曜、YYYY-MM-DD） */
  weekStart: string;
  /** Target_Week 平日 5 日分の日別集計（Occupancy_Count・出社率・在宅率） */
  days: DashboardDailyOccupancy[];
}

/**
 * GET /dashboard/attendees の 1 出社者分のエントリ（要件 4.6）。
 */
export interface DashboardAttendee {
  /** 出社者のユーザー ID（User.id） */
  userId: string;
  /** 氏名 */
  name: string;
  /** メールアドレス */
  email: string;
}

/**
 * GET /dashboard/attendees のレスポンス（要件 4.6、4.7）。
 * 対象日に出社（office）を登録した Employee 一覧を返す。0 人の場合は空配列とする（要件 4.7）。
 */
export interface DashboardAttendeesResponse {
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** 出社者一覧（0 人の場合は空配列。要件 4.7） */
  attendees: DashboardAttendee[];
}

/**
 * GET/PUT /dashboard/threshold のレスポンス（要件 4.3、4.4）。
 * システム全体で単一のしきい値設定を表す。
 */
export interface ThresholdResponse {
  /** 出社上限しきい値（0〜100） */
  upperThreshold: number;
  /** 出社下限しきい値（0〜100） */
  lowerThreshold: number;
}
