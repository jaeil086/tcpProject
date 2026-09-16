import * as fc from 'fast-check';
import {
  countOccupancy,
  computeDailyRates,
  ScheduleRecord,
} from './occupancy';
import { WorkLocation } from '../entities/enums';

// OccupancyCalculator（純粋ドメインロジック）の property テスト。
// 設計書の Correctness Properties のうち Property 6（タスク 4.6）と
// Property 8（タスク 4.7）を 1 ファイルにまとめて検証する（同一モジュール対象のため）。
// タグ形式は規約に従い `// Feature: ai-team-planner, Property {番号}: {プロパティ本文}`。

/** 日付の小さなプール。同一日への衝突を頻発させ、集計・比率ロジックを十分に刺激する。 */
const DATE_POOL: readonly string[] = [
  '2025-06-02',
  '2025-06-03',
  '2025-06-04',
  '2025-06-05',
  '2025-06-06',
];

/** userId の小さなプール。実装は userId で重複排除しないため、あえて衝突しやすくする。 */
const USER_POOL: readonly string[] = ['u1', 'u2', 'u3', 'u4'];

/** DATE_POOL から 1 つ選ぶ arbitrary。対象日と同じプールから生成し、一致を頻発させる。 */
const dateArbitrary: fc.Arbitrary<string> = fc.constantFrom(...DATE_POOL);

/** ScheduleRecord 1 件を生成する arbitrary（小さなプールから userId・date・workLocation を選ぶ）。 */
const scheduleRecordArbitrary: fc.Arbitrary<ScheduleRecord> = fc.record({
  userId: fc.constantFrom(...USER_POOL),
  date: dateArbitrary,
  workLocation: fc.constantFrom(WorkLocation.Office, WorkLocation.Remote),
});

/**
 * ScheduleRecord 配列の arbitrary。
 * 0〜30 件を生成し、同一日・同一 userId の衝突が頻繁に起きるようにする。
 * 空配列も含めることで「対象日に登録者 0 人」の境界も自然に網羅する。
 */
const schedulesArbitrary: fc.Arbitrary<ScheduleRecord[]> = fc.array(
  scheduleRecordArbitrary,
  { minLength: 0, maxLength: 30 },
);

describe('OccupancyCalculator（純粋ドメインロジック）', () => {
  // Feature: ai-team-planner, Property 6: Occupancy_Count は当日 office 登録者数に一致する
  //
  // 対象タスク: 4.6（Validates: Requirements 3.2, 4.1）。
  // 任意の勤務予定集合・任意の対象日について、countOccupancy は
  //   「date が一致し、かつ workLocation === office のレコード数」
  // に厳密に一致する。期待値は実装とは独立に再計算して照合する。
  // 実装は userId で重複排除しないため、期待値も「レコード数」で数える（実装契約と一致させる）。
  // 対象日に office 登録者が 0 人となるケースも生成対象に含まれる。
  it('countOccupancy は当日 office レコード数に一致する（Property 6 / タスク 4.6）', () => {
    fc.assert(
      fc.property(schedulesArbitrary, dateArbitrary, (schedules, date) => {
        // 実装から独立した再計算による期待値。
        let expected = 0;
        for (const record of schedules) {
          if (record.date === date && record.workLocation === WorkLocation.Office) {
            expected += 1;
          }
        }

        const actual = countOccupancy(schedules, date);

        // Occupancy_Count は当日 office 登録者数に厳密一致する。
        expect(actual).toBe(expected);
        // 件数は非負である（サニティチェック）。
        expect(actual).toBeGreaterThanOrEqual(0);
      }),
      // 各 property テストは最低 100 回実行する（設計書 Testing Strategy）。
      { numRuns: 100 },
    );
  });

  // Feature: ai-team-planner, Property 8: 出社率・在宅率は 0〜100% に収まり合計が 100% になる
  //
  // 対象タスク: 4.7（Validates: Requirements 4.5）。
  // 任意の勤務予定集合・任意の対象日について:
  //   (1) officeRate・remoteRate はともに [0, 100] の範囲に収まる。
  //   (2) total >= 1（当日 1 人以上が登録）のとき officeRate + remoteRate === 100。
  //   (3) total === 0（登録者 0 人）の境界では両率が 0 であり、[0, 100] に収まる
  //       （このとき合計 100 は要求しない）。
  //   (4) officeCount + remoteCount === total、かつ officeCount === countOccupancy（整合性）。
  it('出社率・在宅率は 0〜100% に収まり合計が 100% になる（Property 8 / タスク 4.7）', () => {
    fc.assert(
      fc.property(schedulesArbitrary, dateArbitrary, (schedules, date) => {
        const result = computeDailyRates(schedules, date);

        // (1) 両率とも [0, 100] の範囲内。
        expect(result.officeRate).toBeGreaterThanOrEqual(0);
        expect(result.officeRate).toBeLessThanOrEqual(100);
        expect(result.remoteRate).toBeGreaterThanOrEqual(0);
        expect(result.remoteRate).toBeLessThanOrEqual(100);

        // (4) 件数の整合性: office + remote === total、office === Occupancy_Count。
        expect(result.officeCount + result.remoteCount).toBe(result.total);
        expect(result.officeCount).toBe(countOccupancy(schedules, date));

        if (result.total === 0) {
          // (3) 境界: 登録者 0 人のときは両率とも 0（合計 100 は要求しない）。
          expect(result.officeRate).toBe(0);
          expect(result.remoteRate).toBe(0);
        } else {
          // (2) total >= 1 のとき合計は厳密に 100。
          expect(result.officeRate + result.remoteRate).toBe(100);
        }
      }),
      { numRuns: 100 },
    );
  });
});
