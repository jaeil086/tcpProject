// Feature: ai-team-planner
// フロントエンドとバックエンドで共有する TypeScript 型定義。
//
// 設計方針:
// - バックエンドの DTO / エンティティ enum（backend/src/**）と 1:1 で整合させ、
//   API レスポンス・リクエストの形状を一箇所に集約して表記ゆれを防ぐ。
// - フロント側では enum ではなくユニオン型（as const + リテラル）で表現し、
//   バンドルサイズと相互運用性を優先する。値はバックエンドの enum と一致させる。

/**
 * 勤務区分。バックエンドの WorkLocation enum と値を一致させる。
 *
 * - Office（出社）: 神田オフィスへの出社。Occupancy_Count（混雑度）の唯一のカウント対象。
 * - Remote（テレワーク）: 在宅勤務。
 * - Aoyama（青山）: 本社（青山）への出社。
 * - Other（その他）: 研修・外出など。
 * - Vacation（休暇）: 休暇。
 *
 * 出社率の分母は稼働者（Office + Remote + Aoyama）。Other / Vacation は分母から除外する。
 */
export const WorkLocation = {
  Office: 'office',
  Remote: 'remote',
  Aoyama: 'aoyama',
  Other: 'other',
  Vacation: 'vacation',
} as const;
export type WorkLocation = (typeof WorkLocation)[keyof typeof WorkLocation];

/**
 * ユーザーのロール（3 階層の権限体系）。
 * バックエンドの UserRole enum と値を一致させる。
 *
 * - SuperAdmin（最上位管理者）: すべての操作が可能（チーム作成／削除、全ユーザー管理）。
 * - TeamAdmin（チーム管理者）: 自チームの閲覧・メンバーのチーム割り当てが可能。
 * - Employee（従業員）: 本人の勤務予定の登録・閲覧のみ。
 */
export const UserRole = {
  Employee: 'employee',
  TeamAdmin: 'team_admin',
  SuperAdmin: 'super_admin',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * バックエンド共通の統一エラー応答形式（backend ErrorResponse に一致）。
 * フロントは errorCode を解釈してユーザー向けの日本語メッセージを分岐する。
 */
export interface ErrorResponse {
  /** HTTP ステータスコード */
  statusCode: number;
  /** アプリ固有のエラーコード（例: UNAUTHORIZED, FORBIDDEN） */
  errorCode: string;
  /** ユーザー向け日本語メッセージ */
  message: string;
}

// ---------------------------------------------------------------------------
// 認証（AuthModule）
// ---------------------------------------------------------------------------

/**
 * POST /auth/login のリクエストボディ（要件 1.2）。
 */
export interface LoginRequest {
  /** メールアドレス */
  email: string;
  /** パスワード */
  password: string;
}

/**
 * POST /auth/register のリクエストボディ。
 * 自己管理型認証でのアカウント新規登録に用いる。
 */
export interface RegisterRequest {
  /** メールアドレス */
  email: string;
  /** パスワード（8 文字以上） */
  password: string;
  /** 氏名 */
  name: string;
}

/**
 * POST /auth/login のレスポンス（backend LoginResponse に一致、要件 1.2）。
 * 自己管理型 JWT 認証へ移行したため、返却されるのはアクセストークン関連のみ。
 */
export interface LoginResponse {
  /** アクセストークン（保護 API へのアクセスに用いる JWT） */
  accessToken: string;
  /** トークン種別（通常は "Bearer"） */
  tokenType: string;
  /** アクセストークンの有効期限（秒） */
  expiresIn: number;
}

/**
 * POST /auth/logout のレスポンス（要件 1.7）。
 */
export interface LogoutResponse {
  /** ログアウト成功フラグ */
  success: boolean;
}

/**
 * GET /auth/me のレスポンス（backend UserProfile に一致）。
 * ロール・所属チームを含み、DB 上の実データに基づく。
 */
export interface UserProfile {
  /** アプリ内ユーザー ID（UUID） */
  id: string;
  /** Cognito のサブジェクト識別子（自己管理型認証では null） */
  cognitoSub: string | null;
  /** メールアドレス */
  email: string;
  /** 氏名 */
  name: string;
  /** ロール（employee / administrator） */
  role: UserRole;
  /** 所属チーム ID（未所属の場合は null） */
  teamId: string | null;
  /** 所属チーム名（未所属または未解決の場合は null） */
  teamName: string | null;
}

// ---------------------------------------------------------------------------
// チーム（TeamsModule）
// ---------------------------------------------------------------------------

/**
 * GET /teams が返すチーム 1 件分（要件 3.3、3.4）。
 * バックエンドの TeamSummary に一致し、リーダー情報を含む。
 */
export interface Team {
  /** チーム ID（UUID） */
  id: string;
  /** チーム名 */
  name: string;
  /** リーダーのユーザー ID（未設定の場合は null） */
  leaderId: string | null;
  /** リーダーの氏名（未設定または未解決の場合は null） */
  leaderName: string | null;
}

/**
 * POST /teams のリクエストボディ。管理者がチームを新規作成する際に用いる。
 */
export interface CreateTeamRequest {
  /** チーム名 */
  name: string;
}

// ---------------------------------------------------------------------------
// 管理者向けユーザー管理（Admin Users API）
// ---------------------------------------------------------------------------

/**
 * GET /users が返す管理者向けユーザー 1 件分（backend AdminUserView に一致）。
 * 管理画面でのロール変更・チーム割り当ての対象となる。
 */
export interface AdminUserView {
  /** アプリ内ユーザー ID（UUID） */
  id: string;
  /** メールアドレス */
  email: string;
  /** 氏名 */
  name: string;
  /** ロール（employee / administrator） */
  role: UserRole;
  /** 所属チーム ID（未所属の場合は null） */
  teamId: string | null;
  /** 所属チーム名（未所属または未解決の場合は null） */
  teamName: string | null;
}

/**
 * PUT /users/:id/team のリクエストボディ。
 * teamId が null の場合はチーム未所属に更新する。
 */
export interface AssignTeamRequest {
  /** 割り当てるチーム ID（未所属にする場合は null） */
  teamId: string | null;
}

/**
 * PUT /users/:id/role のリクエストボディ。
 */
export interface UpdateRoleRequest {
  /** 変更後のロール（employee / team_admin / super_admin） */
  role: UserRole;
}

/**
 * PUT /users/:id/password のレスポンス（backend ResetPasswordResponseDto に一致）。
 * 最上位管理者がユーザーのパスワードを一時パスワードへ再設定した結果を表す。
 * temporaryPassword はこの応答でのみ返される平文であり、保存・再取得はできない。
 */
export interface ResetPasswordResponse {
  /** 対象ユーザーの管理者向けビュー（パスワードハッシュは含まない）。 */
  user: AdminUserView;
  /** 生成された一時パスワード（平文。この応答でのみ取得可能）。 */
  temporaryPassword: string;
}

// ---------------------------------------------------------------------------
// 勤務予定（ScheduleModule）
// ---------------------------------------------------------------------------

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
 * GET /schedules/me のレスポンス（backend WeekScheduleResponse に一致、要件 2.6）。
 * Target_Week の起点日と、月〜金の平日 5 日分（未登録を含む）を返す。
 */
export interface WeekSchedule {
  /** Target_Week の起点日（翌週の月曜、YYYY-MM-DD） */
  weekStart: string;
  /** 平日 5 日分の勤務予定（登録済み／未登録を区別。要件 2.6） */
  days: ScheduleDayEntry[];
}

/**
 * PUT /schedules/me のリクエストボディ（要件 2.1、2.4）。
 */
export interface UpsertScheduleRequest {
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** 勤務区分（office / remote） */
  workLocation: WorkLocation;
}

/**
 * PUT /schedules/me の確認応答（backend UpsertScheduleResponse に一致、要件 2.1）。
 */
export interface UpsertScheduleResponse {
  /** 登録・更新が成功したことを示すフラグ */
  success: boolean;
  /** 保存された対象日（YYYY-MM-DD） */
  date: string;
  /** 保存された勤務区分（office / remote） */
  workLocation: WorkLocation;
}

// ---------------------------------------------------------------------------
// カレンダー（CalendarModule）
// ---------------------------------------------------------------------------

/**
 * カレンダー集約における、あるメンバーの 1 日分の勤務予定エントリ（要件 3.6）。
 */
export interface CalendarDayEntry {
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** 勤務区分（office / remote）。未登録の場合は null。 */
  workLocation: WorkLocation | null;
}

/**
 * カレンダー集約における 1 メンバー分の勤務予定（要件 3.1、3.6）。
 */
export interface CalendarMember {
  /** メンバーのユーザー ID（User.id） */
  userId: string;
  /** メンバーの氏名 */
  name: string;
  /** Target_Week 平日 5 日分の勤務予定（登録済み／未登録を区別。要件 3.6） */
  days: CalendarDayEntry[];
}

/**
 * ある日の Occupancy_Count（当日 office 登録者数。要件 3.2）。
 */
export interface OccupancyByDate {
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** 当日 office を登録したメンバー数 */
  officeCount: number;
}

/**
 * GET /calendar のレスポンス（backend CalendarResponse に一致、要件 3.1〜3.4、3.6）。
 */
export interface CalendarResponse {
  /** Target_Week の起点日（翌週の月曜、YYYY-MM-DD） */
  weekStart: string;
  /** 集約対象として解決されたチーム ID（未所属かつ未指定の場合は null） */
  teamId: string | null;
  /** 選択チームに所属するメンバーの週次勤務予定（要件 3.3、3.6） */
  members: CalendarMember[];
  /** 各日の Occupancy_Count（要件 3.2） */
  occupancyByDate: OccupancyByDate[];
}

/**
 * GET /calendar のクエリパラメータ。
 */
export interface CalendarQuery {
  /** 対象チーム ID（省略時は自チーム。要件 3.4） */
  teamId?: string;
  /** Target_Week の起点日（省略時はサーバー現在日から翌週を導出） */
  weekStart?: string;
}

// ---------------------------------------------------------------------------
// ダッシュボード（DashboardModule）
// ---------------------------------------------------------------------------

/**
 * GET /dashboard/occupancy の 1 日分の集計エントリ（要件 4.1、4.5）。
 */
export interface DashboardDailyOccupancy {
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** 当日 office（出社=神田）を登録したメンバー数（= Occupancy_Count） */
  officeCount: number;
  /** 当日 remote（テレワーク）を登録したメンバー数 */
  remoteCount: number;
  /** 当日 aoyama（本社・青山）を登録したメンバー数 */
  aoyamaCount: number;
  /** 当日 other（その他）を登録したメンバー数 */
  otherCount: number;
  /** 当日 vacation（休暇）を登録したメンバー数 */
  vacationCount: number;
  /** 当日に稼働区分（office + remote + aoyama）を登録したメンバー総数（出社率の分母） */
  total: number;
  /** 出社率（0〜100）。total === 0 のときは 0 */
  officeRate: number;
  /** 在宅率（0〜100）。total === 0 のときは 0 */
  remoteRate: number;
  /** 青山率（0〜100）。total === 0 のときは 0 */
  aoyamaRate: number;
}

/**
 * GET /dashboard/occupancy のレスポンス（backend DashboardOccupancyResponse に一致、要件 4.1、4.5）。
 */
export interface DashboardOccupancy {
  /** Target_Week の起点日（翌週の月曜、YYYY-MM-DD） */
  weekStart: string;
  /** Target_Week 平日 5 日分の日別集計（Occupancy_Count・出社率・在宅率） */
  days: DashboardDailyOccupancy[];
}

/**
 * GET /dashboard/attendees の 1 出社者分のエントリ（要件 4.6）。
 */
export interface Attendee {
  /** 出社者のユーザー ID（User.id） */
  userId: string;
  /** 氏名 */
  name: string;
  /** メールアドレス */
  email: string;
}

/**
 * GET /dashboard/attendees のレスポンス（backend DashboardAttendeesResponse に一致、要件 4.6、4.7）。
 */
export interface Attendees {
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** 出社者一覧（0 人の場合は空配列。要件 4.7） */
  attendees: Attendee[];
}

/**
 * GET/PUT /dashboard/threshold のしきい値設定（backend ThresholdResponse に一致、要件 4.3、4.4）。
 */
export interface Threshold {
  /** 出社上限しきい値（0〜100） */
  upperThreshold: number;
  /** 出社下限しきい値（0〜100） */
  lowerThreshold: number;
}

// ---------------------------------------------------------------------------
// AI 分析（AnalysisModule）
// ---------------------------------------------------------------------------

/**
 * 出社人員の過多／過少警告（backend AnalysisWarning に一致、要件 5.2、5.3）。
 */
export interface AnalysisWarning {
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** 警告種別。over_capacity（過多）／ under_capacity（過少） */
  type: 'over_capacity' | 'under_capacity';
  /** 該当日の Occupancy_Count（出社人員数） */
  occupancyCount: number;
  /** 警告メッセージ（日本語）。対象日付と occupancyCount を含む */
  message: string;
}

/**
 * 日別の勤務パターン要約（backend DailyPatternSummary に一致、要件 5.4）。
 */
export interface DailyPatternSummary {
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** 当日 office（出社=神田）を登録したメンバー数（出社人数） */
  officeCount: number;
  /** 当日 remote（テレワーク）を登録したメンバー数（在宅人数） */
  remoteCount: number;
  /** 当日 aoyama（本社・青山）を登録したメンバー数 */
  aoyamaCount: number;
  /** 当日 other（その他）を登録したメンバー数 */
  otherCount: number;
  /** 当日 vacation（休暇）を登録したメンバー数 */
  vacationCount: number;
}

/**
 * POST /analysis/run のレスポンス（backend AnalysisRunResponse に一致、要件 5.1〜5.4、5.6）。
 */
export interface AnalysisRunResponse {
  /** Target_Week の起点日（翌週の月曜、YYYY-MM-DD） */
  targetWeekStart: string;
  /** 分析対象の勤務予定が存在したかどうか（false の場合は要件 5.6 の対象なしケース） */
  hasData: boolean;
  /** 対象データが存在しない旨のメッセージ（hasData=false のときのみ設定。要件 5.6） */
  message?: string;
  /** 分析結果の生成時刻（ISO 8601 文字列。hasData=false のときは未設定） */
  generatedAt?: string;
  /** 出社人員の過多／過少警告の一覧（要件 5.2、5.3。hasData=false のときは空配列） */
  warnings: AnalysisWarning[];
  /** 全対象日を網羅する日別パターン要約（要件 5.4。hasData=false のときは空配列） */
  summary: DailyPatternSummary[];
}
