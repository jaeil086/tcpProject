// Feature: ai-team-planner
// 勤務区分（WorkLocation）の表示用ユーティリティ。
// ラベル・配色・選択肢を一箇所に集約し、勤務予定登録画面（ScheduleEditor）と
// チームカレンダー（TeamCalendar）で共通利用して表記ゆれを防ぐ。

import { WorkLocation } from '../types';

/**
 * 勤務区分ごとの表示メタ情報。
 * - label: 画面表示用の日本語ラベル。
 * - badgeClass: カレンダーセルなどのバッジ配色（Tailwind クラス）。
 */
interface WorkLocationMeta {
  label: string;
  badgeClass: string;
}

/** 勤務区分 → 表示メタ情報の対応表。 */
const WORK_LOCATION_META: Record<WorkLocation, WorkLocationMeta> = {
  [WorkLocation.Office]: { label: '出社', badgeClass: 'bg-blue-100 text-blue-800' },
  [WorkLocation.Remote]: { label: 'テレワーク', badgeClass: 'bg-green-100 text-green-800' },
  [WorkLocation.Aoyama]: { label: '青山', badgeClass: 'bg-purple-100 text-purple-800' },
  [WorkLocation.Other]: { label: 'その他', badgeClass: 'bg-amber-100 text-amber-800' },
  [WorkLocation.Vacation]: { label: '休暇', badgeClass: 'bg-pink-100 text-pink-800' },
};

/** 未登録（workLocation=null）の表示メタ情報。 */
const UNREGISTERED_META: WorkLocationMeta = {
  label: '未登録',
  badgeClass: 'bg-gray-50 text-gray-400',
};

/**
 * 勤務区分の表示順（ドロップダウン・凡例の並び）。
 * 出社（神田）を先頭に、テレワーク・青山・その他・休暇の順。
 */
export const WORK_LOCATION_ORDER: readonly WorkLocation[] = [
  WorkLocation.Office,
  WorkLocation.Remote,
  WorkLocation.Aoyama,
  WorkLocation.Other,
  WorkLocation.Vacation,
];

/**
 * ドロップダウン等で用いる選択肢（value + label）の一覧。表示順は WORK_LOCATION_ORDER に従う。
 */
export const WORK_LOCATION_OPTIONS: readonly { value: WorkLocation; label: string }[] =
  WORK_LOCATION_ORDER.map((value) => ({ value, label: WORK_LOCATION_META[value].label }));

/**
 * 勤務区分（null=未登録を含む）を表示ラベルへ変換する。
 */
export function workLocationLabel(workLocation: WorkLocation | null): string {
  if (workLocation === null) {
    return UNREGISTERED_META.label;
  }
  return WORK_LOCATION_META[workLocation]?.label ?? UNREGISTERED_META.label;
}

/**
 * 勤務区分（null=未登録を含む）を表示ラベルとバッジ配色へ変換する。
 */
export function renderWorkLocation(workLocation: WorkLocation | null): WorkLocationMeta {
  if (workLocation === null) {
    return UNREGISTERED_META;
  }
  return WORK_LOCATION_META[workLocation] ?? UNREGISTERED_META;
}
