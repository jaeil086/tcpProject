// Feature: ai-team-planner
// TargetWeekResolver: 基準日から Target_Week（翌週の月〜金、平日 5 日間）を導出し、
// 任意の日付が Target_Week の範囲内かを判定する純粋関数モジュール（要件 2.1、2.5）。
//
// 設計方針:
// - 副作用を持たない（DB・外部 API・現在時刻の暗黙参照なし）純粋 TS として実装し、
//   NestJS などのフレームワーク依存を持たない。これによりタスク 4.2 の property テストが
//   容易に書けるようにする。
// - 日付は Schedule.date（DB の date 型、YYYY-MM-DD 文字列）と整合させるため、
//   すべて 'YYYY-MM-DD' 形式の文字列で表現する。
// - 日付計算はタイムゾーン依存の off-by-one を避けるため、UTC の 00:00:00 に固定した
//   「日付のみ」表現（Date.UTC）で行い、決定的（deterministic）に保つ。

/** 1 週間の日数（翌週の月曜を求める際のオフセットに使用）。 */
const DAYS_IN_WEEK = 7;

/** Target_Week に含まれる平日（月〜金）の日数。 */
const WEEKDAYS_IN_TARGET_WEEK = 5;

/**
 * Target_Week の導出結果。
 * - weekStart: Target_Week の起点日（翌週の月曜、YYYY-MM-DD）
 * - dates: 月曜から金曜までの連続する平日 5 日分の日付文字列（YYYY-MM-DD）の配列
 */
export interface TargetWeek {
  /** 翌週の月曜日（Target_Week の起点日、YYYY-MM-DD） */
  weekStart: string;
  /** Target_Week の 5 日分（翌週の月〜金、平日）の日付文字列（YYYY-MM-DD） */
  dates: string[];
}

/**
 * 'YYYY-MM-DD' 形式の妥当性を検証する正規表現（形式チェック用）。
 * 実際の暦上の妥当性（存在する日付か）は parseDateOnly でさらに検証する。
 */
const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  const utcMillis = Date.UTC(year, month - 1, day);
  const parsed = new Date(utcMillis);

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
function formatDateOnly(date: Date): string {
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
 * 基準日が今週のどの曜日（月〜日）であっても、Target_Week の起点は一意に定まる。
 * 生成される日付は月〜金の平日 5 日分だが、起点算出のオフセットは 1 週間（7 日）である。
 *
 * @param referenceDate 基準日（'YYYY-MM-DD'）
 * @returns 翌週の月曜日（'YYYY-MM-DD'）
 */
export function getTargetWeekStart(referenceDate: string): string {
  const reference = parseDateOnly(referenceDate);
  const currentWeekMonday = getMondayOfWeek(reference);
  const nextWeekMonday = addDays(currentWeekMonday, DAYS_IN_WEEK);
  return formatDateOnly(nextWeekMonday);
}

/**
 * 基準日から Target_Week（翌週の月〜金、平日 5 日間）を導出する純粋関数（要件 2.1）。
 *
 * @param referenceDate 基準日（'YYYY-MM-DD'）
 * @returns 翌週の起点日（月曜）と、月曜から金曜までの平日 5 日分の日付文字列配列
 */
export function resolveTargetWeek(referenceDate: string): TargetWeek {
  const weekStart = getTargetWeekStart(referenceDate);
  const weekStartDate = parseDateOnly(weekStart);

  const dates: string[] = [];
  for (let offset = 0; offset < WEEKDAYS_IN_TARGET_WEEK; offset++) {
    dates.push(formatDateOnly(addDays(weekStartDate, offset)));
  }

  return { weekStart, dates };
}

/**
 * 指定日が、基準日から導出される Target_Week（翌週の月〜金 平日 5 日間）の
 * いずれかに一致するかを判定する純粋関数（要件 2.5）。
 *
 * Target_Week の 5 日は月〜金の平日のみで構成されるため、土曜・日曜は必ず
 * 範囲外（false）となる。
 *
 * @param date 判定対象の日付（'YYYY-MM-DD'）
 * @param referenceDate 基準日（'YYYY-MM-DD'）
 * @returns date が Target_Week の平日 5 日のいずれかであれば true、それ以外は false
 */
export function isWithinTargetWeek(
  date: string,
  referenceDate: string,
): boolean {
  // 形式・暦上の妥当性を検証する。不正な日付は範囲内とはみなさない。
  const target = formatDateOnly(parseDateOnly(date));
  const { dates } = resolveTargetWeek(referenceDate);

  // Target_Week の 5 日（月〜金）に一致する場合のみ true。土日は含まれない。
  return dates.includes(target);
}
