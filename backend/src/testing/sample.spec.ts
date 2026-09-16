import * as fc from 'fast-check';
import { add } from './sample.helper';

// テスト基盤（Jest + fast-check）が正しく動作することを確認するサンプルテスト。
// 実際のドメインプロパティ（Property 1〜12）はタスク 4.x 以降で実装する。
// ここでは property テストの記述規約（numRuns: 100・タグコメント）を示すのみ。

describe('テスト基盤サンプル（Jest + fast-check）', () => {
  // 通常の単体テスト（例示）
  it('add は 2 つの数値を加算する', () => {
    expect(add(1, 2)).toBe(3);
  });

  // property テストのサンプル。
  // タグ形式は本番プロパティと同じ規約に従う:
  //   `// Feature: ai-team-planner, Property {番号}: {プロパティ本文}`
  // ここではサンプルとして加法の交換法則を検証する。
  // Feature: ai-team-planner, Property sample: add は交換法則を満たす（add(a, b) === add(b, a)）
  it('add は交換法則を満たす（property テスト）', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        // 交換法則: a + b === b + a
        return add(a, b) === add(b, a);
      }),
      // 各 property テストは最低 100 回実行する（設計書 Testing Strategy）
      { numRuns: 100 },
    );
  });
});
