import { WorkLocation } from '../../entities/enums';

/**
 * PUT /schedules/me の確認応答（要件 2.1）。
 * 保存された勤務予定（日付・勤務区分）と成功フラグを返す。
 */
export interface UpsertScheduleResponse {
  /** 登録・更新が成功したことを示すフラグ */
  success: boolean;
  /** 保存された対象日（YYYY-MM-DD） */
  date: string;
  /** 保存された勤務区分（office / remote） */
  workLocation: WorkLocation;
}

/**
 * GET /schedules/me が返す各日 1 件分のエントリ（要件 2.6）。
 * workLocation が null の場合は「未登録」を表す。
 */
export interface ScheduleDayEntry {
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** 勤務区分（office / remote）。未登録の場合は null。 */
  workLocation: WorkLocation | null;
}

/**
 * GET /schedules/me のレスポンス（要件 2.6）。
 * Target_Week の起点日と、月〜金の平日 5 日分（未登録を含む）を返す。
 */
export interface WeekScheduleResponse {
  /** Target_Week の起点日（翌週の月曜、YYYY-MM-DD） */
  weekStart: string;
  /** 平日 5 日分の勤務予定（登録済み／未登録を区別。要件 2.6） */
  days: ScheduleDayEntry[];
}
