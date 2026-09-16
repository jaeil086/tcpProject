import * as fc from 'fast-check';
import {
  isValidThreshold,
  applyThresholdUpdate,
  ThresholdPair,
} from './threshold';

// ThresholdValidator（純粋ドメインロジック）の property テスト。
// 設計書の Correctness Properties のうち Property 10 を検証する（タスク 4.9）。
// タグ形式は規約に従い `// Feature: ai-team-planner, Property {番号}: {プロパティ本文}`。

/** しきい値の下限（含む）。 */
const THRESHOLD_MIN = 0;
/** しきい値の上限（含む）。 */
const THRESHOLD_MAX = 100;

/**
 * テスト側で独立に妥当性を再計算するためのヘルパー。
 * 実装（threshold.ts）とは別ロジックとして書き下すことで、
 * 実装のバグをテストが素通りしないようにする。
 * 妥当条件: upper・lower がいずれも 0〜100 の整数、かつ upper > lower。
 */
function expectedValidity(upper: number, lower: number): boolean {
  const isValidInt = (v: number): boolean =>
    Number.isInteger(v) && v >= THRESHOLD_MIN && v <= THRESHOLD_MAX;
  return isValidInt(upper) && isValidInt(lower) && upper > lower;
}

/**
 * 境界値（0・100・upper=lower）や範囲外（-1・101 など）を広く網羅するため、
 * -10〜110 の整数を生成する arbitrary。
 */
const boundaryIntArbitrary: fc.Arbitrary<number> = fc.integer({
  min: -10,
  max: 110,
});

/** 任意の既存しきい値ペア（値そのものの妥当性は問わない）。 */
const thresholdPairArbitrary: fc.Arbitrary<ThresholdPair> = fc.record({
  upperThreshold: boundaryIntArbitrary,
  lowerThreshold: boundaryIntArbitrary,
});

/**
 * 非整数・特殊値を含む arbitrary。
 * 非整数の double、NaN、±Infinity を混在させ、いずれも拒否されることを確認する。
 */
const nonIntegerArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc
    .double({ min: -10, max: 110, noNaN: true })
    .filter((v) => !Number.isInteger(v)),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
);

describe('ThresholdValidator（純粋ドメインロジック）', () => {
  // Feature: ai-team-planner, Property 10: しきい値は妥当な場合のみ受理され不正時は既存値を保持する
  //
  // このテストでは以下を検証する（整数ペア・境界値網羅）:
  //   (1) isValidThreshold は「両者が 0〜100 の整数かつ upper > lower」のときに限り true。
  //       期待値はテスト側で独立に再計算する。
  //   (2) applyThresholdUpdate は isValidThreshold が true のときに限り受理する（accepted）。
  //   (3) 受理時は返却値が next と一致する。
  //   (4) 拒否時は返却値が current と一致し、既存値が変更されない（deep-equal）。
  it('整数ペアは妥当時のみ受理され、不正時は既存値を保持する（Property 10）', () => {
    fc.assert(
      fc.property(
        boundaryIntArbitrary,
        boundaryIntArbitrary,
        thresholdPairArbitrary,
        (upper, lower, current) => {
          const expected = expectedValidity(upper, lower);

          // (1) 予測子の妥当性がテスト側の独立計算と一致すること。
          expect(isValidThreshold(upper, lower)).toBe(expected);

          const next: ThresholdPair = {
            upperThreshold: upper,
            lowerThreshold: lower,
          };
          const result = applyThresholdUpdate(current, next);

          // (2) 受理可否は妥当性と等価であること。
          expect(result.accepted).toBe(expected);

          if (expected) {
            // (3) 受理時は新値がそのまま返ること。
            expect(result.value).toEqual(next);
          } else {
            // (4) 拒否時は既存値が変更されないこと（deep-equal）。
            expect(result.value).toEqual(current);
          }
        },
      ),
      // 各 property テストは最低 100 回実行する（設計書 Testing Strategy）。
      { numRuns: 100 },
    );
  });

  // Feature: ai-team-planner, Property 10: しきい値は妥当な場合のみ受理され不正時は既存値を保持する
  //
  // 境界値の明示的検証: 0・100・upper=lower・範囲外(-1, 101) を含む代表点で、
  // 妥当性判定と既存値保持が意図どおりに働くことを確認する。
  it('境界値（0・100・upper=lower・範囲外）を正しく扱う（Property 10）', () => {
    const current: ThresholdPair = { upperThreshold: 70, lowerThreshold: 30 };

    // 妥当ケース: 端値かつ upper > lower。
    expect(isValidThreshold(100, 0)).toBe(true);
    expect(isValidThreshold(1, 0)).toBe(true);
    expect(applyThresholdUpdate(current, {
      upperThreshold: 100,
      lowerThreshold: 0,
    })).toEqual({
      accepted: true,
      value: { upperThreshold: 100, lowerThreshold: 0 },
    });

    // 不正ケース: upper=lower（upper > lower を満たさない）。
    expect(isValidThreshold(50, 50)).toBe(false);
    expect(applyThresholdUpdate(current, {
      upperThreshold: 50,
      lowerThreshold: 50,
    })).toEqual({ accepted: false, value: current });

    // 不正ケース: upper < lower。
    expect(isValidThreshold(30, 70)).toBe(false);

    // 不正ケース: 範囲外（-1・101）。
    expect(isValidThreshold(101, 0)).toBe(false);
    expect(isValidThreshold(50, -1)).toBe(false);
    expect(applyThresholdUpdate(current, {
      upperThreshold: 101,
      lowerThreshold: 0,
    })).toEqual({ accepted: false, value: current });
  });

  // Feature: ai-team-planner, Property 10: しきい値は妥当な場合のみ受理され不正時は既存値を保持する
  //
  // 非整数・特殊値（非整数 double・NaN・±Infinity）は、範囲・大小に関わらず
  // 必ず拒否され、既存値が保持されることを確認する。
  it('非整数・NaN・Infinity は必ず拒否され既存値を保持する（Property 10）', () => {
    fc.assert(
      fc.property(
        nonIntegerArbitrary,
        boundaryIntArbitrary,
        thresholdPairArbitrary,
        (nonIntUpper, lower, current) => {
          // 上限に非整数を与えた場合は必ず拒否される。
          expect(isValidThreshold(nonIntUpper, lower)).toBe(false);
          const result = applyThresholdUpdate(current, {
            upperThreshold: nonIntUpper,
            lowerThreshold: lower,
          });
          expect(result.accepted).toBe(false);
          expect(result.value).toEqual(current);
        },
      ),
      { numRuns: 100 },
    );
  });
});
