// Feature: ai-team-planner
// フロントエンド用の日付・週計算ユーティリティ。
//
// 設計方針:
// - バックエンドの TargetWeekResolver（backend/src/domain/target-week.ts）と
//   同一のアルゴリズム（ISO 週・月曜起点・翌週）で Target_Week を導出し、
//   フロントとバックエンドの週計算が必ず一致するようにする。
// - すべて 'YYYY-MM-DD' 形式の文字列で表現し、タイムゾーン依存の off-by-one を
//   避けるため日付計算は Date.UTC（UTC 00:00:00 固定の「日付のみ」表現）で行う。
// - React などのフレームワーク依存を持たない純粋関数として実装し、
//   タスク 12.3 の property テストで検証できるようにする。

/** Target_Week の 1 週間（7 日間）の日数。 */
const DAYS_IN_WEEK = 7;

/** 'YYYY-MM-DD' 形式の妥当性を検証する正規表現（形式チェック用）。 */
const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Target_Week の導出結果。
 */
export interface TargetWeek {
  /** 翌週の月曜日（Target_Week の起点日、YYYY-MM-DD） */
  weekStart: string;
  /** Target_Week の 7 日分（月〜日）の日付文字列（YYYY-MM-DD） */
  dates: string[];
}

/**
 * 'YYYY-MM-DD' 文字列を、UTC 00:00:00 に固定した Date（日付のみ表現）へ変換する。
 * タイムゾーンによる日付ずれを避けるため、必ず Date.UTC を用いる。
 *
 * @param dateStr 'YYYY-MM-DD' 形式の日付文字列
 * @returns 当該日の UTC 深夜を表す Date
 * @throws 形式不正、または暦上存在しない日付の場合は Error を投げる
 */
function parseDateOnly(dateStr: string): Date {
  if (!DATE_STRING_PATTERN.test(dateStr)) {
    throw new Error(
      `日付は 'YYYY-MM-DD' 形式で指定してください: 受領値="${dateStr}"`,
    );
  }

  const [year, month, day] = dateStr.split('-').map((part) => Number(part));
  // 月は 0 始まりのため month - 1 を指定する。
  const parsed = new Date(Date.UTC(year, month - 1, day));

  // 例: 2024-02-30 のような存在しない日付は、生成後の各要素が入力と一致しない。
  const isSameDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  if (!isSameDate) {
    throw new Error(`存在しない日付です: 受領値="${dateStr}"`);
  }

  return parsed;
}

/**
 * UTC の日付を 'YYYY-MM-DD' 文字列へ整形する。
 *
 * @param date 対象の Date（UTC 前提）
 * @returns 'YYYY-MM-DD' 形式の文字列
 */
export function formatDate(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  // 月は 0 始まりのため +1 する。
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 指定日数を加算した新しい Date（UTC 日付のみ）を返す純粋関数。
 *
 * @param date 基準となる Date（UTC 前提）
 * @param days 加算する日数（負値も可）
 * @returns 日数を加算した新しい Date
 */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * 指定日が属する「今週の月曜日」を返す（ISO 週の定義: 月曜=週の起点）。
 *
 * JavaScript の getUTCDay() は 日曜=0, 月曜=1, ..., 土曜=6 を返すため、
 * 月曜からの経過日数（0〜6）に変換して差し引くことで今週の月曜を求める。
 *
 * @param date 基準日（UTC 前提）
 * @returns 当該週の月曜日を表す Date
 */
function getMondayOfWeek(date: Date): Date {
  const dayOfWeek = date.getUTCDay(); // 0(日)〜6(土)
  // 月曜からの経過日数: 日曜(0) は 6 日経過、月曜(1) は 0 日経過。
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return addDays(date, -daysSinceMonday);
}

/**
 * 基準日から Target_Week（翌週の月曜、YYYY-MM-DD）の起点日を導出する純粋関数。
 *
 * ルール: 基準日が属する「今週の月曜」の 7 日後が「翌週の月曜」となる。
 * バックエンドの getTargetWeekStart と同一アルゴリズム（要件 2.1）。
 *
 * @param referenceDate 基準日（'YYYY-MM-DD'）
 * @returns 翌週の月曜日（'YYYY-MM-DD'）
 */
export function getTargetWeekStart(referenceDate: string): string {
  const reference = parseDateOnly(referenceDate);
  const currentWeekMonday = getMondayOfWeek(reference);
  const nextWeekMonday = addDays(currentWeekMonday, DAYS_IN_WEEK);
  return formatDate(nextWeekMonday);
}

/**
 * 基準日から Target_Week（翌週の月〜日、7 日間）を導出する純粋関数（要件 2.1）。
 * バックエンドの resolveTargetWeek と同一の結果を返す。
 *
 * @param referenceDate 基準日（'YYYY-MM-DD'）
 * @returns 翌週の起点日（月曜）と、月曜から日曜までの 7 日分の日付文字列配列
 */
export function resolveTargetWeek(referenceDate: string): TargetWeek {
  const weekStart = getTargetWeekStart(referenceDate);
  const weekStartDate = parseDateOnly(weekStart);

  const dates: string[] = [];
  for (let offset = 0; offset < DAYS_IN_WEEK; offset++) {
    dates.push(formatDate(addDays(weekStartDate, offset)));
  }

  return { weekStart, dates };
}

/**
 * 指定日が、基準日から導出される Target_Week（翌週の月〜日 7 日間）の
 * 範囲内かどうかを判定する純粋関数（要件 2.5）。
 * バックエンドの isWithinTargetWeek と同一の判定を行う。
 *
 * @param date 判定対象の日付（'YYYY-MM-DD'）
 * @param referenceDate 基準日（'YYYY-MM-DD'）
 * @returns date が Target_Week の 7 日のいずれかであれば true、それ以外は false
 */
export function isWithinTargetWeek(
  date: string,
  referenceDate: string,
): boolean {
  // 形式・暦上の妥当性を検証する。不正な日付は範囲内とはみなさない。
  const target = parseDateOnly(date);
  const { weekStart } = resolveTargetWeek(referenceDate);
  const weekStartDate = parseDateOnly(weekStart);
  const weekEndDate = addDays(weekStartDate, DAYS_IN_WEEK - 1);

  return (
    target.getTime() >= weekStartDate.getTime() &&
    target.getTime() <= weekEndDate.getTime()
  );
}

/**
 * 曜日ラベル（日本語）。getUTCDay() の値（0=日 〜 6=土）に対応する。
 */
const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * 'YYYY-MM-DD' 文字列に対応する日本語の曜日ラベル（例: '月'）を返す。
 *
 * @param dateStr 対象日（'YYYY-MM-DD'）
 * @returns 日本語 1 文字の曜日ラベル
 */
export function getWeekdayLabelJa(dateStr: string): string {
  const date = parseDateOnly(dateStr);
  return WEEKDAY_LABELS_JA[date.getUTCDay()];
}

/**
 * 'YYYY-MM-DD' 文字列を表示用の日本語日付（例: '5月12日（月）'）へ整形する。
 *
 * @param dateStr 対象日（'YYYY-MM-DD'）
 * @returns 表示用の日本語日付文字列
 */
export function formatDateJa(dateStr: string): string {
  const date = parseDateOnly(dateStr);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${month}月${day}日（${getWeekdayLabelJa(dateStr)}）`;
}

/**
 * ローカル現在日を 'YYYY-MM-DD' 文字列として返すヘルパー。
 * 基準日を明示せずに Target_Week を求めたい呼び出し側（既定挙動）で用いる。
 * 注意: 現在時刻に依存するため純粋関数ではない（テスト対象からは除外する）。
 *
 * @returns 現在日の 'YYYY-MM-DD'（ローカルタイムゾーン基準）
 */
export function today(): string {
  const now = new Date();
  const year = now.getFullYear().toString().padStart(4, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
