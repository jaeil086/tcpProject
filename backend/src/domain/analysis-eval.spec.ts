import * as fc from 'fast-check';
import {
  evaluateAnalysis,
  AnalysisThresholds,
} from './analysis-eval';
import { ScheduleRecord } from './occupancy';
import { WorkLocation } from '../entities/enums';

// AnalysisEvaluator（純粋ドメインロジック）の property テスト。
// 設計書の Correctness Properties のうち Property 11（タスク 4.11）と
// Property 12（タスク 4.12）を 1 ファイルにまとめて検証する（同一モジュール対象のため）。
// タグ形式は規約に従い `// Feature: ai-team-planner, Property {番号}: {プロパティ本文}`。

/** Target_Week を模した 7 日分の対象日プール（月〜日）。 */
const TARGET_DATES: readonly string[] = [
  '2025-06-02',
  '2025-06-03',
  '2025-06-04',
  '2025-06-05',
  '2025-06-06',
  '2025-06-07',
  '2025-06-08',
];

/**
 * レコードの date に用いる小さなプール。
 * 対象日（TARGET_DATES）に加え、対象外の日も混ぜることで、
 * 対象日への衝突を頻発させつつ、対象外レコードが集計に混入しないことも刺激する。
 */
const DATE_POOL: readonly string[] = [
  ...TARGET_DATES,
  '2025-06-01', // 対象週の直前（対象外）
  '2025-06-09', // 対象週の直後（対象外）
];

/** userId の小さなプール。実装は userId で重複排除しないため、あえて衝突しやすくする。 */
const USER_POOL: readonly string[] = ['u1', 'u2', 'u3', 'u4'];

/** ScheduleRecord 1 件を生成する arbitrary。 */
const scheduleRecordArbitrary: fc.Arbitrary<ScheduleRecord> = fc.record({
  userId: fc.constantFrom(...USER_POOL),
  date: fc.constantFrom(...DATE_POOL),
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

/**
 * 妥当なしきい値（upper > lower、両者とも 0〜100）を生成する arbitrary。
 * lower を 0〜99、offset を 1〜(100 - lower) とし upper = lower + offset で
 * 常に upper > lower かつ upper <= 100 を満たす。
 */
const validThresholdsArbitrary: fc.Arbitrary<AnalysisThresholds> = fc
  .integer({ min: 0, max: 99 })
  .chain((lower) =>
    fc
      .integer({ min: 1, max: 100 - lower })
      .map((offset) => ({
        lowerThreshold: lower,
        upperThreshold: lower + offset,
      })),
  );

/** 実装から独立に、当日の office レコード数（Occupancy_Count）を再計算する。 */
function recomputeOfficeCount(
  schedules: readonly ScheduleRecord[],
  date: string,
): number {
  let count = 0;
  for (const record of schedules) {
    if (record.date === date && record.workLocation === WorkLocation.Office) {
      count += 1;
    }
  }
  return count;
}

/** 実装から独立に、当日の remote レコード数を再計算する。 */
function recomputeRemoteCount(
  schedules: readonly ScheduleRecord[],
  date: string,
): number {
  let count = 0;
  for (const record of schedules) {
    if (record.date === date && record.workLocation === WorkLocation.Remote) {
      count += 1;
    }
  }
  return count;
}

describe('AnalysisEvaluator（純粋ドメインロジック）', () => {
  // Feature: ai-team-planner, Property 11: 警告は判定条件を満たす日にのみ生成され日付と人数を含む
  //
  // 対象タスク: 4.11（Validates: Requirements 5.2, 5.3）。
  // 任意の勤務予定集合・対象日集合・妥当なしきい値（upper > lower、0〜100）について:
  //   (1) ある日の over_capacity 警告が存在する ⇔ 当日 Occupancy_Count >= upperThreshold。
  //   (2) ある日の under_capacity 警告が存在する ⇔ 当日 Occupancy_Count <= lowerThreshold。
  //   (3) いずれの条件も満たさない日には警告が生成されない。
  //   (4) 生成された各警告の message には対象日付と occupancyCount が
  //       部分文字列として含まれ、warning.occupancyCount は独立再計算値に一致する。
  // Occupancy_Count は実装から独立に再計算して照合する。
  it('警告は判定条件を満たす日にのみ生成され日付と人数を含む（Property 11 / タスク 4.11）', () => {
    fc.assert(
      fc.property(
        schedulesArbitrary,
        validThresholdsArbitrary,
        (schedules, thresholds) => {
          const dates = TARGET_DATES;
          const { warnings } = evaluateAnalysis(schedules, dates, thresholds);

          // 警告は対象日のみを指す（対象外日付の警告は存在しない）。
          for (const warning of warnings) {
            expect(dates).toContain(warning.date);
          }

          for (const date of dates) {
            const expectedCount = recomputeOfficeCount(schedules, date);
            const overForDate = warnings.filter(
              (w) => w.date === date && w.type === 'over_capacity',
            );
            const underForDate = warnings.filter(
              (w) => w.date === date && w.type === 'under_capacity',
            );

            const expectOver = expectedCount >= thresholds.upperThreshold;
            const expectUnder = expectedCount <= thresholds.lowerThreshold;

            // (1) 過多警告は判定条件と過不足なく対応する（iff）。
            if (expectOver) {
              expect(overForDate).toHaveLength(1);
            } else {
              expect(overForDate).toHaveLength(0);
            }

            // (2) 過少警告は判定条件と過不足なく対応する（iff）。
            if (expectUnder) {
              expect(underForDate).toHaveLength(1);
            } else {
              expect(underForDate).toHaveLength(0);
            }

            // (3) 妥当なしきい値（upper > lower）では両条件が同時成立しないため、
            //     1 日あたりの警告は高々 1 件。
            expect(overForDate.length + underForDate.length).toBeLessThanOrEqual(
              1,
            );

            // (4) 生成された警告の occupancyCount とメッセージ内容を検証する。
            for (const warning of [...overForDate, ...underForDate]) {
              // occupancyCount は独立再計算値に一致する。
              expect(warning.occupancyCount).toBe(expectedCount);
              // メッセージに対象日付が含まれる。
              expect(warning.message).toContain(date);
              // メッセージに occupancyCount（人数）が含まれる。
              expect(warning.message).toContain(String(expectedCount));
            }
          }
        },
      ),
      // 各 property テストは最低 100 回実行する（設計書 Testing Strategy）。
      { numRuns: 100 },
    );
  });

  // Feature: ai-team-planner, Property 12: パターン要約は各日の実データと整合する
  //
  // 対象タスク: 4.12（Validates: Requirements 5.4）。
  // 任意の勤務予定集合・Target_Week（7 日）の対象日集合について:
  //   (1) summary は対象日 7 日分すべてを含む（各日ちょうど 1 エントリ）。
  //   (2) 各エントリの officeCount / remoteCount は、当該日に office / remote を
  //       登録したメンバーの実人数（独立再計算値）に一致する。
  // 実装は userId で重複排除しないため、期待値も「レコード数」で数える（実装契約と一致させる）。
  it('パターン要約は各日の実データと整合する（Property 12 / タスク 4.12）', () => {
    fc.assert(
      fc.property(schedulesArbitrary, (schedules) => {
        const dates = TARGET_DATES;
        // しきい値は要約には影響しないため任意の妥当値を固定で与える。
        const thresholds: AnalysisThresholds = {
          lowerThreshold: 1,
          upperThreshold: 5,
        };
        const { summary } = evaluateAnalysis(schedules, dates, thresholds);

        // (1) 7 日分すべてを網羅し、対象日と同順・同数である。
        expect(summary).toHaveLength(dates.length);
        expect(summary.map((s) => s.date)).toEqual([...dates]);

        // (2) 各日の officeCount / remoteCount は独立再計算値に一致する。
        for (const date of dates) {
          const entry = summary.find((s) => s.date === date);
          expect(entry).toBeDefined();
          expect(entry!.officeCount).toBe(recomputeOfficeCount(schedules, date));
          expect(entry!.remoteCount).toBe(recomputeRemoteCount(schedules, date));
        }
      }),
      { numRuns: 100 },
    );
  });
});
