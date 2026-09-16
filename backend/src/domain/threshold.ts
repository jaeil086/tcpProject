// Feature: ai-team-planner
// ThresholdValidator: 出社人員の過不足判定に用いるしきい値
// （Upper_Threshold / Lower_Threshold）の妥当性を検証する純粋関数モジュール
// （要件 4.3、4.4）。
//
// 設計方針:
// - 副作用を持たない（DB・外部 API・現在時刻の暗黙参照なし）純粋 TS として実装し、
//   NestJS などのフレームワーク依存を持たない。これによりタスク 4.9 の property テストが
//   容易に書けるようにする。
// - 検証ルールは設計書 Property 10 に準拠する（下記「妥当性ルール」参照）。
// - 不正な更新は必ず拒否し、既存のしきい値設定を変更しない（要件 4.4）。
//
// 妥当性ルール（Property 10）:
//   ペア (upper, lower) が妥当であるのは、次のすべてを満たす場合に限る。
//     (1) upper と lower がいずれも整数である（NaN・Infinity・非整数は不可）
//     (2) 0 ≤ lower ≤ 100
//     (3) 0 ≤ upper ≤ 100
//     (4) upper > lower
//   上記を 1 つでも満たさない場合は不正とみなし、更新を拒否する。

/** しきい値の下限（含む）。 */
const THRESHOLD_MIN = 0;
/** しきい値の上限（含む）。 */
const THRESHOLD_MAX = 100;

/**
 * しきい値ペア。
 * - upperThreshold: 出社上限しきい値（0〜100 の整数）
 * - lowerThreshold: 出社下限しきい値（0〜100 の整数）
 * エンティティ ThresholdSetting のフィールド名と整合させる。
 */
export interface ThresholdPair {
  /** 出社上限しきい値（0〜100） */
  upperThreshold: number;
  /** 出社下限しきい値（0〜100） */
  lowerThreshold: number;
}

/**
 * しきい値更新の適用結果。
 * - accepted: 更新が受理されたか（妥当なら true、不正なら false）
 * - value: 受理時は新しい値、拒否時は変更されない既存値
 */
export interface ThresholdUpdateResult {
  /** 更新が受理されたか */
  accepted: boolean;
  /** 受理時は新しい値、拒否時は既存値（不変） */
  value: ThresholdPair;
}

/**
 * 値が 0〜100 の整数であるかを判定する内部ヘルパー。
 * NaN・Infinity・非整数・数値以外はすべて false とする。
 *
 * @param value 判定対象の値
 * @returns 0〜100 の整数であれば true
 */
function isIntegerInRange(value: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= THRESHOLD_MIN &&
    value <= THRESHOLD_MAX
  );
}

/**
 * しきい値ペア (upper, lower) が妥当であるかを判定する純粋関数（要件 4.3）。
 *
 * 妥当性の条件（Property 10）:
 *   upper・lower がいずれも 0〜100 の整数であり、かつ upper > lower であること。
 *
 * @param upper 出社上限しきい値
 * @param lower 出社下限しきい値
 * @returns 妥当であれば true、それ以外は false
 */
export function isValidThreshold(upper: number, lower: number): boolean {
  return isIntegerInRange(upper) && isIntegerInRange(lower) && upper > lower;
}

/**
 * しきい値の更新を「妥当な場合のみ受理し、不正な場合は既存値を保持する」形で
 * 適用する純粋関数（要件 4.4）。
 *
 * - next が妥当な場合: accepted=true とし、value に next を返す（更新受理）。
 * - next が不正な場合: accepted=false とし、value に current をそのまま返す
 *   （既存値を変更しない）。
 *
 * 返却値は入力オブジェクトを共有しない新しいオブジェクトとし、
 * 呼び出し側の意図しない変更（ミューテーション）を防ぐ。
 *
 * @param current 現在のしきい値設定（既存値）
 * @param next 更新候補のしきい値設定
 * @returns 受理可否と、受理時は新値・拒否時は既存値を含む結果
 */
export function applyThresholdUpdate(
  current: ThresholdPair,
  next: ThresholdPair,
): ThresholdUpdateResult {
  if (isValidThreshold(next.upperThreshold, next.lowerThreshold)) {
    return {
      accepted: true,
      value: {
        upperThreshold: next.upperThreshold,
        lowerThreshold: next.lowerThreshold,
      },
    };
  }

  // 不正時は既存値を保持する（要件 4.4）。
  return {
    accepted: false,
    value: {
      upperThreshold: current.upperThreshold,
      lowerThreshold: current.lowerThreshold,
    },
  };
}

/**
 * しきい値ペアが不正な場合に、妥当性ルールを説明する日本語エラーを投げる純粋関数。
 * 妥当な場合は何もしない。
 *
 * @param upper 出社上限しきい値
 * @param lower 出社下限しきい値
 * @throws 不正な場合は Error（許容ルールを含む日本語メッセージ）
 */
export function assertThreshold(upper: number, lower: number): void {
  if (!isValidThreshold(upper, lower)) {
    throw new Error(
      'しきい値が不正です。upper・lower はいずれも 0〜100 の整数で、' +
        `かつ upper > lower を満たす必要があります: 受領値 upper=${String(
          upper,
        )}, lower=${String(lower)}`,
    );
  }
}
