/**
 * ドメイン共通の列挙型（enum）定義。
 * DB カラム・DTO・ドメイン層で共通利用し、値の表記を一箇所に集約する。
 */

/**
 * 勤務区分。
 * office（出社）／ remote（在宅）の 2 値のみを許容する（要件 2.2、2.3）。
 */
export enum WorkLocation {
  Office = 'office',
  Remote = 'remote',
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
