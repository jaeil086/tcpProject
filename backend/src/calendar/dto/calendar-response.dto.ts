import { WorkLocation } from '../../entities/enums';

/**
 * カレンダー集約における、あるメンバーの 1 日分の勤務予定エントリ（要件 3.6）。
 * workLocation が null の場合は「未登録」を表す。
 */
export interface CalendarDayEntry {
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** 勤務区分（office / remote）。未登録の場合は null。 */
  workLocation: WorkLocation | null;
}

/**
 * カレンダー集約における 1 メンバー分の勤務予定（要件 3.1、3.6）。
 * days は Target_Week の 7 日分を並び順どおりに網羅する。
 */
export interface CalendarMember {
  /** メンバーのユーザー ID（User.id） */
  userId: string;
  /** メンバーの氏名 */
  name: string;
  /** Target_Week 7 日分の勤務予定（登録済み／未登録を区別。要件 3.6） */
  days: CalendarDayEntry[];
}

/**
 * GET /calendar のレスポンス（設計書 CalendarResponse に対応）。
 *
 * - weekStart: Target_Week の起点日（翌週の月曜、YYYY-MM-DD）
 * - teamId: 集約対象として解決されたチーム ID（自チーム既定時も解決後の値を返す）
 * - members: 選択チームの所属メンバーのみ（要件 3.3）。各メンバーは 7 日分の勤務予定を持つ
 * - occupancyByDate: 各日の Occupancy_Count（当日 office 登録者数。要件 3.2）
 */
export interface CalendarResponse {
  /** Target_Week の起点日（翌週の月曜、YYYY-MM-DD） */
  weekStart: string;
  /** 集約対象として解決されたチーム ID（未所属かつ未指定の場合は null） */
  teamId: string | null;
  /** 選択チームに所属するメンバーの週次勤務予定（要件 3.3、3.6） */
  members: CalendarMember[];
  /** 各日の Occupancy_Count（当日 office 登録者数。要件 3.2） */
  occupancyByDate: { date: string; officeCount: number }[];
}
