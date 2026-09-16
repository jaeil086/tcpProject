// テスト基盤（Jest + fast-check）の動作確認用サンプルヘルパー。
// 注意: これはドメインロジックではなく、テスト方針（property テストの書き方）を
// 示すためだけの純粋関数である。実際のドメイン実装はタスク 4.x で行う。

/**
 * 数値を加算する純粋関数（副作用なし）。
 * property テストで加法の交換法則などを検証するためのサンプル。
 */
export function add(a: number, b: number): number {
  return a + b;
}
