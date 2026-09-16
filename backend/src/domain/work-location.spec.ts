import * as fc from 'fast-check';
import { isValidWorkLocation, assertWorkLocation } from './work-location';
import { WorkLocation } from '../entities/enums';

// WorkLocationValidator（純粋ドメインロジック）の property テスト。
// 設計書の Correctness Properties のうち Property 2 を検証する。
// タグ形式は規約に従い `// Feature: ai-team-planner, Property {番号}: {プロパティ本文}`。

/** 許容される 2 値（'office' / 'remote'）。生成・検証の両方で唯一の情報源とする。 */
const VALID_VALUES: readonly WorkLocation[] = Object.values(WorkLocation);

/**
 * 完全一致で拒否されるべき、紛らわしい文字列の一覧。
 * 大文字混じり・前後空白・空文字・部分一致など、境界的なケースを明示的に含める。
 */
const ADVERSARIAL_STRINGS: readonly string[] = [
  'Office',
  'OFFICE',
  'Remote',
  'REMOTE',
  ' office',
  'office ',
  ' remote',
  'remote ',
  '',
  'remotee',
  'offic',
  'office\n',
  'work',
];

/**
 * 「有効値ではない任意の文字列」を生成する arbitrary。
 * fast-check の生成文字列に加え、紛らわしい固定文字列も候補に含めたうえで、
 * 万一 'office' / 'remote' に一致した場合は filter で除外する。
 */
const invalidStringArbitrary: fc.Arbitrary<string> = fc
  .oneof(fc.string(), fc.constantFrom(...ADVERSARIAL_STRINGS))
  .filter((s) => !VALID_VALUES.includes(s as WorkLocation));

/**
 * 文字列以外の任意入力（number / boolean / null / undefined / object / array）を生成する arbitrary。
 * unknown 入力への防御が働くこと（すべて拒否されること）を検証するために用いる。
 */
const nonStringArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.object(),
  fc.array(fc.anything()),
);

describe('WorkLocationValidator（純粋ドメインロジック）', () => {
  // Feature: ai-team-planner, Property 2: 勤務区分は 2 値のみを受理する
  //
  // 有効値（'office' / 'remote'）は必ず受理される:
  //   (1) isValidWorkLocation は true を返す。
  //   (2) assertWorkLocation は例外を投げず、入力値をそのまま返す（不変）。
  it('有効値 office / remote は受理され値が変化しない（Property 2）', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VALID_VALUES), (value) => {
        expect(isValidWorkLocation(value)).toBe(true);
        expect(assertWorkLocation(value)).toBe(value);
      }),
      // 各 property テストは最低 100 回実行する（設計書 Testing Strategy）。
      { numRuns: 100 },
    );
  });

  // Feature: ai-team-planner, Property 2: 勤務区分は 2 値のみを受理する
  //
  // 有効値と完全一致しない任意の文字列は必ず拒否される:
  //   (1) isValidWorkLocation は false を返す。
  //   (2) assertWorkLocation は Error を投げる。
  // 大文字混じり・前後空白・空文字・部分一致などの境界ケースを生成対象に含める。
  it('有効値以外の任意文字列は拒否される（Property 2）', () => {
    fc.assert(
      fc.property(invalidStringArbitrary, (value) => {
        expect(isValidWorkLocation(value)).toBe(false);
        expect(() => assertWorkLocation(value)).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ai-team-planner, Property 2: 勤務区分は 2 値のみを受理する
  //
  // 文字列以外の任意入力（数値・真偽値・null・undefined・オブジェクト・配列）は
  // すべて拒否される（unknown 入力への防御、要件 2.3）。
  it('文字列以外の任意入力は拒否される（Property 2）', () => {
    fc.assert(
      fc.property(nonStringArbitrary, (value) => {
        expect(isValidWorkLocation(value)).toBe(false);
        expect(() => assertWorkLocation(value)).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ai-team-planner, Property 2: 勤務区分は 2 値のみを受理する
  //
  // 整合性: 任意の入力（文字列・非文字列を問わず）について、
  //   isValidWorkLocation(v) === true  ⟺  assertWorkLocation(v) が例外を投げない
  // が成り立つ。2 つの検証 API が常に同じ判定を返すことを保証する。
  it('isValidWorkLocation と assertWorkLocation の判定は常に一致する（Property 2）', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom<unknown>(...VALID_VALUES),
          invalidStringArbitrary,
          nonStringArbitrary,
        ),
        (value) => {
          const isValid = isValidWorkLocation(value);

          let didThrow = false;
          try {
            assertWorkLocation(value);
          } catch {
            didThrow = true;
          }

          // 受理される場合は例外を投げず、拒否される場合は必ず例外を投げる。
          expect(isValid).toBe(!didThrow);
        },
      ),
      { numRuns: 100 },
    );
  });
});
