// Feature: ai-team-planner
// WorkLocationValidator: 入力値が勤務区分（office / remote）として妥当かを検証する
// 純粋関数モジュール（要件 2.2、2.3）。
//
// 設計方針:
// - 副作用を持たない（DB・外部 API・現在時刻の暗黙参照なし）純粋 TS として実装し、
//   NestJS などのフレームワーク依存を持たない。これによりタスク 4.4 の property テストが
//   容易に書けるようにする。
// - 勤務区分の許容値は enums.ts の WorkLocation（office / remote）を唯一の情報源とし、
//   本モジュール内で enum を再定義しない（表記の二重管理を避ける）。
// - マッチングは enum の文字列値（'office' / 'remote'）に対する「完全一致（case-sensitive）」
//   とする。大文字を含む 'Office'・'OFFICE'、前後の空白、空文字、null / undefined、
//   数値など文字列以外の任意入力（unknown）はすべて拒否する（要件 2.3）。

import { WorkLocation } from '../entities/enums';

/**
 * WorkLocation として許容される文字列値の一覧（'office' / 'remote'）。
 * enum の値から動的に導出し、許容値の定義を一箇所（enums.ts）へ集約する。
 * 型ガード・エラーメッセージの双方で共通利用する。
 */
const ALLOWED_WORK_LOCATIONS: readonly WorkLocation[] =
  Object.values(WorkLocation);

/**
 * 任意の入力値が WorkLocation（office / remote）のいずれかであるかを判定する型ガード。
 *
 * 判定は enum の文字列値との「完全一致（大文字小文字を区別）」で行う。
 * 文字列以外（number / null / undefined / object など）、空文字、前後に空白を含む値、
 * 'Office' のような大文字混じりの値はすべて false を返す（要件 2.2、2.3）。
 *
 * @param value 検証対象の任意入力
 * @returns value が 'office' または 'remote' の場合のみ true
 */
export function isValidWorkLocation(value: unknown): value is WorkLocation {
  // 文字列以外は無条件で拒否する（unknown 入力への防御）。
  if (typeof value !== 'string') {
    return false;
  }
  // enum の値との完全一致のみを許容する。
  return ALLOWED_WORK_LOCATIONS.includes(value as WorkLocation);
}

/**
 * 入力値を検証し、妥当であれば WorkLocation として返す。不正な場合は許容値を明示した
 * 日本語メッセージとともに Error を投げる（要件 2.3）。
 *
 * upsert 処理などで「不正値は登録拒否し、許容値を提示する」用途に用いる。
 *
 * @param value 検証対象の任意入力
 * @returns 妥当な場合の WorkLocation（'office' または 'remote'）
 * @throws 勤務区分が 'office' / 'remote' 以外の場合、許容値を含む Error を投げる
 */
export function assertWorkLocation(value: unknown): WorkLocation {
  if (isValidWorkLocation(value)) {
    return value;
  }

  const allowedValues = ALLOWED_WORK_LOCATIONS.join(' / ');
  // 受領値はログ・デバッグの手掛かりとして併記する（JSON 化で型の違いを明示）。
  const receivedValue = JSON.stringify(value);
  throw new Error(
    `勤務区分は ${allowedValues} のいずれかを指定してください: 受領値=${receivedValue}`,
  );
}
