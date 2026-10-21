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

/**
 * ScheduleRecord 1 件を生成する arbitrary（小さなプールから userId・date・workLocation を選ぶ）。
 * workLocation は全 5 区分（office / remote / aoyama / other / vacation）から選ぶ。
 */
const scheduleRecordArbitrary: fc.Arbitrary<ScheduleRecord> = fc.record({
  userId: fc.constantFrom(...USER_POOL),
  date: dateArbitrary,
  workLocation: fc.constantFrom(
    WorkLocation.Office,
    WorkLocation.Remote,
    WorkLocation.Aoyama,
    WorkLocation.Other,
    WorkLocation.Vacation,
  ),
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

  // Feature: ai-team-planner, Property 8: 各勤務区分の比率は 0〜100% に収まり、稼働 3 区分の合計が 100% になる
  //
  // 対象タスク: 4.7（Validates: Requirements 4.5）。
  // 勤務区分を 5 値（office/remote/aoyama/other/vacation）へ拡張した新ポリシー:
  //   - Occupancy_Count（混雑度）は office のみを数える（aoyama は含めない）。
  //   - 出社率の分母 total は「稼働区分 = office + remote + aoyama」の登録者数とし、
  //     other / vacation は分母に含めない。
  //
  // 任意の勤務予定集合・任意の対象日について:
  //   (1) officeRate・remoteRate・aoyamaRate はいずれも [0, 100] の範囲に収まる。
  //   (2) total >= 1（当日 1 人以上が稼働区分を登録）のとき、
  //       officeRate + remoteRate + aoyamaRate は 100 に一致する（浮動小数の端数は許容）。
  //   (3) total === 0（稼働登録者 0 人）の境界では 3 率とも 0 であり、[0, 100] に収まる
  //       （このとき合計 100 は要求しない）。
  //   (4) officeCount + remoteCount + aoyamaCount === total、
  //       かつ officeCount === countOccupancy（整合性）。
  //   (5) other / vacation は total に含まれない（分母から除外）。
  it('各区分の比率は 0〜100% に収まり稼働 3 区分の合計が 100% になる（Property 8 / タスク 4.7）', () => {
    fc.assert(
      fc.property(schedulesArbitrary, dateArbitrary, (schedules, date) => {
        const result = computeDailyRates(schedules, date);

        // (1) 稼働 3 区分の率はいずれも [0, 100] の範囲内。
        for (const rate of [result.officeRate, result.remoteRate, result.aoyamaRate]) {
          expect(rate).toBeGreaterThanOrEqual(0);
          expect(rate).toBeLessThanOrEqual(100);
        }

        // (4) 件数の整合性: office + remote + aoyama === total、office === Occupancy_Count。
        expect(result.officeCount + result.remoteCount + result.aoyamaCount).toBe(
          result.total,
        );
        expect(result.officeCount).toBe(countOccupancy(schedules, date));

        // (5) other / vacation は分母（total）に含めない。
        const sameDayCount = (location: WorkLocation) =>
          schedules.filter((r) => r.date === date && r.workLocation === location).length;
        expect(result.otherCount).toBe(sameDayCount(WorkLocation.Other));
        expect(result.vacationCount).toBe(sameDayCount(WorkLocation.Vacation));

        if (result.total === 0) {
          // (3) 境界: 稼働登録者 0 人のときは 3 率とも 0（合計 100 は要求しない）。
          expect(result.officeRate).toBe(0);
          expect(result.remoteRate).toBe(0);
          expect(result.aoyamaRate).toBe(0);
        } else {
          // (2) total >= 1 のとき、稼働 3 区分の率の合計は 100（浮動小数の端数を許容）。
          const sum = result.officeRate + result.remoteRate + result.aoyamaRate;
          expect(sum).toBeCloseTo(100, 10);
        }
      }),
      { numRuns: 100 },
    );
  });
});
