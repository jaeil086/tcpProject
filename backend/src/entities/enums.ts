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
 * ユーザーのロール。
 * employee（従業員）／ administrator（管理者）の 2 値を許容する（要件 4.2）。
 */
export enum UserRole {
  Employee = 'employee',
  Administrator = 'administrator',
}
