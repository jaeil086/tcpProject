// Feature: ai-team-planner
// 勤務予定登録・更新画面（ScheduleEditor、要件 2.1〜2.6）。
//
// 設計方針:
// - マウント時に GET /schedules/me（weekStart 省略）を呼び、翌週 Target_Week の
//   平日 5 日分（登録済み／未登録）を取得する（要件 2.6）。読込中・読込失敗の状態を表示する。
// - 各日について勤務区分（出社=office／在宅=remote）を選択できるセグメントボタンを描画する。
//   選択肢は office/remote の 2 値のみを提示するため、不正値は UI レベルで構造的に抑止される
//   （要件 2.2、2.3 の一次抑止）。
// - 表示・編集対象は Target_Week の平日 5 日のみであるため、対象範囲外の日付は UI レベルで
//   構造的に抑止される（要件 2.5 の一次抑止）。
// - いずれかの日の勤務区分を選択／変更すると PUT /schedules/me を呼んで保存する
//   （要件 2.1、2.4）。成功時はローカル状態を更新し短い成功表示を出す。
//   失敗時（ApiError）は日本語メッセージを表示し、既存の表示状態は保持する。
// - 未登録日（workLocation=null）は「未登録」インジケータで区別表示する（要件 2.6）。

import { useCallback, useEffect, useState } from 'react';
import { ApiError, schedulesApi } from '../../api';
import { formatDateJa } from '../../lib/date';
import { WorkLocation, type ScheduleDayEntry, type WeekSchedule } from '../../types';

/** 保存処理中／成功表示を日付単位で管理するための状態。 */
interface DaySaveState {
  /** 保存処理中かどうか。 */
  saving: boolean;
  /** 直近の保存が成功したかどうか（短時間だけ true）。 */
  saved: boolean;
}

/**
 * 勤務区分の選択肢定義（出社／在宅の 2 値のみ）。
 * この配列以外の値は UI に現れないため、不正値は構造的に発生しない（要件 2.2、2.3）。
 */
const WORK_LOCATION_OPTIONS: { value: WorkLocation; label: string }[] = [
  { value: WorkLocation.Office, label: '出社' },
  { value: WorkLocation.Remote, label: '在宅' },
];

/**
 * ApiError（またはその他の例外）を保存失敗時のユーザー向け日本語メッセージへ変換する。
 * 400（対象範囲外・不正値）の場合はサーバーのメッセージをそのまま提示する（要件 2.3、2.5）。
 */
function toSaveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // 400 系（対象範囲外・不正値）はサーバーの日本語メッセージを尊重する。
    if (error.statusCode === 400 && error.message) {
      return error.message;
    }
    if (error.message) {
      return error.message;
    }
  }
  return '勤務予定の保存に失敗しました。時間をおいて再度お試しください。';
}

/**
 * 読込失敗時のユーザー向け日本語メッセージへ変換する。
 */
function toLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return '勤務予定の取得に失敗しました。時間をおいて再度お試しください。';
}

/**
 * 勤務予定編集画面コンポーネント。
 */
export function ScheduleEditor() {
  // 取得した週次勤務予定（Target_Week 平日 5 日分）。
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  // 初回読込中フラグ。
  const [isLoading, setIsLoading] = useState(true);
  // 読込失敗メッセージ（読込に失敗したときのみ設定）。
  const [loadError, setLoadError] = useState<string | null>(null);
  // 保存失敗メッセージ（保存に失敗したときのみ設定）。
  const [saveError, setSaveError] = useState<string | null>(null);
  // 日付単位の保存状態（保存中・成功表示）。
  const [daySaveStates, setDaySaveStates] = useState<Record<string, DaySaveState>>({});

  // マウント時に自身の Target_Week 勤務予定を取得する（要件 2.6）。
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        // weekStart 省略時はサーバーが現在日から翌週を対象として返す。
        const result = await schedulesApi.getMySchedule();
        if (!cancelled) {
          setSchedule(result);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(toLoadErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    // アンマウント後の状態更新を避けるためのクリーンアップ。
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 指定日の勤務区分を保存する（要件 2.1、2.4）。
   * 成功時はローカル状態を更新し、短時間の成功表示を出す。
   * 失敗時は日本語メッセージを表示し、既存の表示状態は変更しない。
   */
  const handleSelect = useCallback(
    async (date: string, workLocation: WorkLocation) => {
      setSaveError(null);
      setDaySaveStates((prev) => ({
        ...prev,
        [date]: { saving: true, saved: false },
      }));

      try {
        const response = await schedulesApi.upsertMySchedule({ date, workLocation });

        // 成功時のみローカル状態を更新する（要件 2.1、2.4）。
        setSchedule((prev) => {
          if (!prev) {
            return prev;
          }
          const days = prev.days.map((day) =>
            day.date === response.date
              ? { ...day, workLocation: response.workLocation }
              : day,
          );
          return { ...prev, days };
        });

        setDaySaveStates((prev) => ({
          ...prev,
          [date]: { saving: false, saved: true },
        }));

        // 一定時間後に成功表示を消す。
        window.setTimeout(() => {
          setDaySaveStates((prev) => {
            const current = prev[date];
            // 以降に別の保存が始まっている場合は触らない。
            if (!current || current.saving) {
              return prev;
            }
            return { ...prev, [date]: { saving: false, saved: false } };
          });
        }, 2000);
      } catch (error) {
        // 失敗時は既存の表示状態（schedule）を変更せず、エラーのみ表示する（要件 2.3、2.5）。
        setSaveError(toSaveErrorMessage(error));
        setDaySaveStates((prev) => ({
          ...prev,
          [date]: { saving: false, saved: false },
        }));
      }
    },
    [],
  );

  return (
    <div className="mx-auto max-w-2xl p-4">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">翌週の勤務予定</h1>
        <p className="mt-1 text-sm text-gray-500">
          翌週（月曜〜金曜、平日）の各日について、出社／在宅を登録できます。
        </p>
      </header>

      {/* 読込中の状態表示 */}
      {isLoading && (
        <div className="rounded border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          読み込み中...
        </div>
      )}

      {/* 読込失敗の状態表示（要件 3.7 に準ずる取得失敗表示） */}
      {!isLoading && loadError && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {loadError}
        </div>
      )}

      {/* 保存失敗メッセージ（対象範囲外・不正値・その他。要件 2.3、2.5） */}
      {saveError && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {saveError}
        </div>
      )}

      {/* 勤務予定リスト（Target_Week 平日 5 日分。要件 2.6） */}
      {!isLoading && !loadError && schedule && (
        <ul className="space-y-2">
          {schedule.days.map((day) => (
            <ScheduleDayRow
              key={day.date}
              day={day}
              saveState={daySaveStates[day.date]}
              onSelect={handleSelect}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** ScheduleDayRow のプロパティ。 */
interface ScheduleDayRowProps {
  /** 対象日の勤務予定エントリ（未登録の場合は workLocation=null）。 */
  day: ScheduleDayEntry;
  /** 当該日の保存状態。 */
  saveState?: DaySaveState;
  /** 勤務区分選択時のハンドラ。 */
  onSelect: (date: string, workLocation: WorkLocation) => void;
}

/**
 * 1 日分の行。日本語日付ラベルと勤務区分セグメントボタン、状態表示を描画する。
 */
function ScheduleDayRow({ day, saveState, onSelect }: ScheduleDayRowProps) {
  const saving = saveState?.saving ?? false;
  const saved = saveState?.saved ?? false;
  // 未登録（workLocation=null）かどうか（要件 2.6）。
  const isUnregistered = day.workLocation === null;

  return (
    <li className="flex items-center justify-between gap-4 rounded border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-3">
        <span className="min-w-[7rem] font-medium text-gray-800">
          {formatDateJa(day.date)}
        </span>
        {/* 未登録インジケータ（要件 2.6） */}
        {isUnregistered && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            未登録
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* 成功／保存中の状態表示 */}
        {saving && <span className="text-xs text-gray-400">保存中...</span>}
        {!saving && saved && <span className="text-xs text-green-600">保存しました</span>}

        {/* 勤務区分セグメントボタン（出社／在宅の 2 値のみ。要件 2.2、2.3） */}
        <div
          role="group"
          aria-label={`${formatDateJa(day.date)}の勤務区分`}
          className="inline-flex overflow-hidden rounded border border-gray-300"
        >
          {WORK_LOCATION_OPTIONS.map((option) => {
            const selected = day.workLocation === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                disabled={saving}
                onClick={() => onSelect(day.date, option.value)}
                className={
                  'px-4 py-1.5 text-sm transition disabled:cursor-not-allowed ' +
                  (selected
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50')
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </li>
  );
}

export default ScheduleEditor;
