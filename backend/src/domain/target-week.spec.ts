import * as fc from 'fast-check';
import {
  resolveTargetWeek,
  getTargetWeekStart,
  isWithinTargetWeek,
} from './target-week';

// TargetWeekResolver（純粋ドメインロジック）の property テスト。
// 設計書の Correctness Properties のうち Property 4 を検証する。
// タグ形式は規約に従い `// Feature: ai-team-planner, Property {番号}: {プロパティ本文}`。

/** 1 週間の日数。 */
const DAYS_IN_WEEK = 7;
/** 1 日あたりのミリ秒。UTC 日付のみ計算に用いる。 */
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * UTC 深夜の Date を 'YYYY-MM-DD' 文字列へ整形するテスト用ヘルパー。
 * 実装側（target-week.ts）の formatDateOnly は非公開のため、テスト側で同等処理を持つ。
 */
function toDateString(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 決定的な日付 arbitrary。
 * 2000-01-01〜2100-12-31 の範囲を UTC の「日オフセット」で生成し、
 * 月末・うるう年・年境界を広く網羅する妥当な 'YYYY-MM-DD' 文字列を返す。
 */
const dateStringArbitrary: fc.Arbitrary<string> = (() => {
  const startMillis = Date.UTC(2000, 0, 1);
  const endMillis = Date.UTC(2100, 11, 31);
  const totalDays = Math.floor((endMillis - startMillis) / MILLIS_PER_DAY);
  return fc
    .integer({ min: 0, max: totalDays })
    .map((offset) => toDateString(new Date(startMillis + offset * MILLIS_PER_DAY)));
})();

describe('TargetWeekResolver（純粋ドメインロジック）', () => {
  // Feature: ai-team-planner, Property 4: Target_Week 範囲外の登録は拒否され状態は不変
  //
  // このテストでは以下を検証する:
  //   (1) 任意の基準日について、resolveTargetWeek は月曜起点の連続する 7 日を返し、
  //       その 7 日はすべて isWithinTargetWeek が true となる（範囲内 7 日の網羅）。
  //   (2) Target_Week の 7 日に含まれない任意の日付は isWithinTargetWeek が false となる
  //       （範囲外日付は必ず拒否される）。これが Property 4 の核心である。
  //   (3) weekStart は月曜であり、基準日が属する週より後（未来）に位置する。
  it('範囲外日付は拒否され、範囲内 7 日を網羅する（Property 4）', () => {
    fc.assert(
      fc.property(dateStringArbitrary, (referenceDate) => {
        const { weekStart, dates } = resolveTargetWeek(referenceDate);

        // (1) 7 日ちょうどで、月曜起点の連続日であること。
        expect(dates).toHaveLength(DAYS_IN_WEEK);
        expect(dates[0]).toBe(weekStart);

        const weekStartMillis = Date.UTC(
          Number(weekStart.slice(0, 4)),
          Number(weekStart.slice(5, 7)) - 1,
          Number(weekStart.slice(8, 10)),
        );

        // weekStart は月曜（getUTCDay() === 1）であること。
        expect(new Date(weekStartMillis).getUTCDay()).toBe(1);

        for (let offset = 0; offset < DAYS_IN_WEEK; offset++) {
          const expected = toDateString(
            new Date(weekStartMillis + offset * MILLIS_PER_DAY),
          );
          // 連続する 7 日が順に並んでいること。
          expect(dates[offset]).toBe(expected);
          // 範囲内 7 日はすべて Target_Week として受理されること。
          expect(isWithinTargetWeek(dates[offset], referenceDate)).toBe(true);
        }

        // (3) getTargetWeekStart は resolveTargetWeek.weekStart と一致すること。
        expect(getTargetWeekStart(referenceDate)).toBe(weekStart);

        // (3) weekStart は基準日より後（未来）であること。基準日は今週内、
        //     weekStart は翌週の月曜なので常に基準日より後になる。
        const referenceMillis = Date.UTC(
          Number(referenceDate.slice(0, 4)),
          Number(referenceDate.slice(5, 7)) - 1,
          Number(referenceDate.slice(8, 10)),
        );
        expect(weekStartMillis).toBeGreaterThan(referenceMillis);
      }),
      // 各 property テストは最低 100 回実行する（設計書 Testing Strategy）。
      { numRuns: 100 },
    );
  });

  // Feature: ai-team-planner, Property 4: Target_Week 範囲外の登録は拒否され状態は不変
  //
  // 範囲外拒否をより厳密に検証する。基準日と、意図的に窓の外へずらした候補日
  // （weekStart より前、または weekEnd より後）を生成し、常に拒否されることを確認する。
  it('窓外へずらした候補日は必ず拒否される（Property 4・境界）', () => {
    fc.assert(
      fc.property(
        dateStringArbitrary,
        // -365〜-1（週より前）または 7〜371（週の終端より後）へずらすオフセット。
        fc.oneof(
          fc.integer({ min: -365, max: -1 }),
          fc.integer({ min: DAYS_IN_WEEK, max: 371 }),
        ),
        (referenceDate, outsideOffset) => {
          const { weekStart } = resolveTargetWeek(referenceDate);
          const weekStartMillis = Date.UTC(
            Number(weekStart.slice(0, 4)),
            Number(weekStart.slice(5, 7)) - 1,
            Number(weekStart.slice(8, 10)),
          );
          // weekStart から window 外へずらした候補日。
          const candidate = toDateString(
            new Date(weekStartMillis + outsideOffset * MILLIS_PER_DAY),
          );
          // 範囲外候補は必ず拒否される（false）。
          expect(isWithinTargetWeek(candidate, referenceDate)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: ai-team-planner, Property 4: Target_Week 範囲外の登録は拒否され状態は不変
  //
  // 等価性による網羅検証: 任意の候補日について、
  //   isWithinTargetWeek(candidate) === (candidate が resolveTargetWeek.dates に含まれる)
  // が成り立つこと。これにより「範囲内のみ受理・範囲外は拒否」を漏れなく検証する。
  it('受理判定は Target_Week 7 日集合への所属と等価である（Property 4）', () => {
    fc.assert(
      fc.property(
        dateStringArbitrary,
        dateStringArbitrary,
        (referenceDate, candidate) => {
          const { dates } = resolveTargetWeek(referenceDate);
          const shouldBeWithin = dates.includes(candidate);
          expect(isWithinTargetWeek(candidate, referenceDate)).toBe(
            shouldBeWithin,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
