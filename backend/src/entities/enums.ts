/**
 * ドメイン共通の列挙型（enum）定義。
 * DB カラム・DTO・ドメイン層で共通利用し、値の表記を一箇所に集約する。
 */

/**
 * 勤務区分。
 *
 * - office（出社）: 神田オフィスへの出社。本アプリの Occupancy_Count（混雑度）の
 *   唯一のカウント対象。神田オフィスは座席が限られるため、この人数を管理する。
 * - remote（テレワーク）: 在宅勤務。
 * - aoyama（青山）: 本社（青山）への出社。神田の混雑度には含めないが、勤務者ではある。
 * - other（その他）: 研修・外出など。勤務者だが出社率の分母には含めない（稼働外として扱う）。
 * - vacation（休暇）: 休暇。稼働外として扱い、出社率の分母に含めない。
 *
 * 出社率（officeRate）の分母は「稼働している勤務者」= office + remote + aoyama とし、
 * other / vacation は分母から除外する（occupancy.ts を参照）。
 */
export enum WorkLocation {
  Office = 'office',
  Remote = 'remote',
  Aoyama = 'aoyama',
  Other = 'other',
  Vacation = 'vacation',
}

/**
 * ユーザーのロール（3 階層の権限体系）。
 *
 * - super_admin（最上位管理者）: すべての操作が可能。チームの作成／削除、全チーム閲覧、
 *   全ユーザーのロール・チーム変更を行える。既定では admin@example.com が該当する。
 * - team_admin（チーム管理者）: 自チームのメンバー閲覧、自チームのダッシュボード／分析閲覧、
 *   メンバーのチーム割り当てが可能。チームの作成／削除はできない。
 * - employee（従業員）: 本人の勤務予定の登録・閲覧のみ可能。
 */
export enum UserRole {
  Employee = 'employee',
  TeamAdmin = 'team_admin',
  SuperAdmin = 'super_admin',
}
