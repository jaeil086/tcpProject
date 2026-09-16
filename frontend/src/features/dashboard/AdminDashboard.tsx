// Feature: ai-team-planner
// 管理者ダッシュボード画面（AdminDashboard、要件 4.1〜4.7）。
//
// 設計方針:
// - マウント時に組織全体の日別集計（GET /dashboard/occupancy、weekStart 省略＝翌週）と
//   現在のしきい値設定（GET /dashboard/threshold）を並列取得する（要件 4.1、4.3、4.5）。
//   取得中はローディング表示、取得失敗時は日本語のエラーメッセージを表示する。
// - Occupancy_Count・出社率／在宅率（要件 4.1、4.5）: Target_Week 7 日分を表で描画する。
//   officeCount（Occupancy_Count）を数値で、officeRate/remoteRate を 0〜100% の
//   パーセント値で表示する。
// - 日別出社者一覧（要件 4.6、4.7）: 管理者が日付を選択すると GET /dashboard/attendees を
//   取得し、氏名・メールの一覧を表示する。出社登録者が 0 人の場合は、その旨のメッセージを
//   表示する（要件 4.7）。
// - しきい値設定フォーム（要件 4.3、4.4）: upperThreshold / lowerThreshold の数値入力を持つ。
//   送信時に PUT /dashboard/threshold を呼び出す。成功時はローカル状態を更新し成功メッセージを、
//   失敗時（ApiError 400: 範囲外または upper<=lower）はサーバーの日本語メッセージを表示し、
//   変更前の値を保持する（要件 4.4）。クライアント側でも事前検証を行うが、正式な検証は
//   サーバー側であり 400 のメッセージを優先して反映する。
// - 管理者専用アクセス（要件 4.2）は ProtectedRoute（requiredRole=Administrator）が担うため、
//   本コンポーネントでは追加の権限制御は行わない。

import { useCallback, useEffect, useState } from 'react';
import { ApiError, dashboardApi } from '../../api';
import { formatDateJa } from '../../lib/date';
import type { Attendee, DashboardOccupancy, Threshold } from '../../types';

/**
 * ダッシュボード取得失敗時のユーザー向け日本語メッセージへ変換する（要件 4.1）。
 */
function toLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return 'ダッシュボードの読み込みに失敗しました。時間をおいて再度お試しください。';
}

/**
 * 出社者一覧取得失敗時のユーザー向け日本語メッセージへ変換する（要件 4.6）。
 */
function toAttendeesErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return '出社者一覧の取得に失敗しました。時間をおいて再度お試しください。';
}

/**
 * しきい値更新失敗時のユーザー向け日本語メッセージへ変換する（要件 4.4）。
 * サーバー側の 400（範囲外・upper<=lower）メッセージを優先して反映する。
 */
function toThresholdErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return 'しきい値の更新に失敗しました。時間をおいて再度お試しください。';
}

/**
 * パーセント値（0〜100）を表示用の文字列（例: '42%'）へ整形する（要件 4.5）。
 * 小数を含む場合は小数第 1 位までに丸める。
 */
function formatPercent(rate: number): string {
  const rounded = Math.round(rate * 10) / 10;
  return `${rounded}%`;
}

/**
 * 管理者ダッシュボード画面コンポーネント。
 */
export function AdminDashboard() {
  // 組織全体の日別集計（Occupancy_Count・出社率・在宅率。要件 4.1、4.5）。
  const [occupancy, setOccupancy] = useState<DashboardOccupancy | null>(null);
  // 現在のしきい値設定（要件 4.3）。フォームの確定値かつ「変更前の値」を保持する（要件 4.4）。
  const [threshold, setThreshold] = useState<Threshold | null>(null);
  // 初回読込中フラグ。
  const [isLoading, setIsLoading] = useState(true);
  // 初回読込エラーメッセージ（要件 4.1）。
  const [loadError, setLoadError] = useState<string | null>(null);

  // 選択中の日付（出社者一覧の対象。未選択は null。要件 4.6）。
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // 選択日の出社者一覧（要件 4.6、4.7）。
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  // 出社者一覧の読込中フラグ。
  const [isAttendeesLoading, setIsAttendeesLoading] = useState(false);
  // 出社者一覧の取得失敗メッセージ（要件 4.6）。
  const [attendeesError, setAttendeesError] = useState<string | null>(null);

  // しきい値フォームの入力値（文字列で保持し、送信時に数値へ変換する）。
  const [upperInput, setUpperInput] = useState('');
  const [lowerInput, setLowerInput] = useState('');
  // しきい値更新中フラグ。
  const [isSaving, setIsSaving] = useState(false);
  // しきい値更新の失敗メッセージ（要件 4.4）。
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  // しきい値更新の成功メッセージ（要件 4.3）。
  const [thresholdSuccess, setThresholdSuccess] = useState<string | null>(null);

  // マウント時に日別集計としきい値を並列取得する（要件 4.1、4.3、4.5）。
  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setIsLoading(true);
      setLoadError(null);
      try {
        // weekStart 省略＝翌週。しきい値と並列取得する。
        const [occupancyResult, thresholdResult] = await Promise.all([
          dashboardApi.getDashboardOccupancy(),
          dashboardApi.getThreshold(),
        ]);
        if (!cancelled) {
          setOccupancy(occupancyResult);
          setThreshold(thresholdResult);
          // フォーム入力の初期値を現在のしきい値で満たす。
          setUpperInput(String(thresholdResult.upperThreshold));
          setLowerInput(String(thresholdResult.lowerThreshold));
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

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 指定日の出社者一覧を取得する（要件 4.6、4.7）。
   * 取得中・成功・失敗の状態を更新する。
   */
  const loadAttendees = useCallback(async (date: string) => {
    setSelectedDate(date);
    setIsAttendeesLoading(true);
    setAttendeesError(null);
    try {
      const result = await dashboardApi.getAttendees(date);
      setAttendees(result.attendees);
    } catch (error) {
      // 取得失敗時は一覧をクリアせず、エラーメッセージのみ設定する。
      setAttendeesError(toAttendeesErrorMessage(error));
    } finally {
      setIsAttendeesLoading(false);
    }
  }, []);

  /**
   * しきい値フォーム送信時のハンドラ（要件 4.3、4.4）。
   * クライアント側で事前検証したうえで PUT /dashboard/threshold を呼び出す。
   * 失敗時は変更前の値（threshold）を保持し、サーバーの日本語メッセージを表示する。
   */
  const handleThresholdSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setThresholdError(null);
      setThresholdSuccess(null);

      const upperValue = Number(upperInput);
      const lowerValue = Number(lowerInput);

      // クライアント側の事前検証（要件 4.4）。正式な検証はサーバー側で行う。
      if (
        upperInput.trim() === '' ||
        lowerInput.trim() === '' ||
        !Number.isInteger(upperValue) ||
        !Number.isInteger(lowerValue)
      ) {
        setThresholdError('しきい値は 0 以上 100 以下の整数で入力してください。');
        return;
      }
      if (upperValue < 0 || upperValue > 100 || lowerValue < 0 || lowerValue > 100) {
        setThresholdError('しきい値は 0 以上 100 以下で入力してください。');
        return;
      }
      if (upperValue <= lowerValue) {
        setThresholdError('出社上限しきい値は出社下限しきい値より大きい値にしてください。');
        return;
      }

      setIsSaving(true);
      try {
        const updated = await dashboardApi.updateThreshold({
          upperThreshold: upperValue,
          lowerThreshold: lowerValue,
        });
        // 成功時はローカル状態を更新し、成功メッセージを表示する（要件 4.3）。
        setThreshold(updated);
        setUpperInput(String(updated.upperThreshold));
        setLowerInput(String(updated.lowerThreshold));
        setThresholdSuccess('しきい値を保存しました。');
      } catch (error) {
        // 失敗時は変更前の値（threshold）を保持し、サーバーのメッセージを表示する（要件 4.4）。
        setThresholdError(toThresholdErrorMessage(error));
      } finally {
        setIsSaving(false);
      }
    },
    [upperInput, lowerInput],
  );

  const days = occupancy?.days ?? [];

  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">管理者ダッシュボード</h1>
        <p className="mt-1 text-sm text-gray-500">
          翌週（月曜〜日曜）の全体の勤務状況を確認し、しきい値を設定できます。
        </p>
      </header>

      {/* 初回読込エラー（要件 4.1） */}
      {loadError && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {loadError}
        </div>
      )}

      {/* 読込中の状態表示 */}
      {isLoading && (
        <div className="rounded border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          読み込み中...
        </div>
      )}

      {!isLoading && occupancy && (
        <div className="flex flex-col gap-8">
          {/* Occupancy_Count・出社率／在宅率（要件 4.1、4.5） */}
          <section aria-labelledby="occupancy-heading">
            <h2 id="occupancy-heading" className="mb-3 text-lg font-semibold text-gray-800">
              日別 出社状況
            </h2>
            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th
                      scope="col"
                      className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600"
                    >
                      項目
                    </th>
                    {days.map((day) => (
                      <th
                        key={day.date}
                        scope="col"
                        className="border-b border-gray-200 px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap"
                      >
                        {formatDateJa(day.date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* 出社人数（Occupancy_Count。要件 4.1） */}
                  <tr className="odd:bg-white even:bg-gray-50">
                    <th
                      scope="row"
                      className="border-b border-gray-100 px-3 py-2 text-left font-medium text-gray-800 whitespace-nowrap"
                    >
                      出社人数
                    </th>
                    {days.map((day) => (
                      <td
                        key={day.date}
                        className="border-b border-gray-100 px-3 py-2 text-center font-semibold text-gray-800"
                      >
                        {day.officeCount}
                      </td>
                    ))}
                  </tr>
                  {/* 出社率（要件 4.5） */}
                  <tr className="odd:bg-white even:bg-gray-50">
                    <th
                      scope="row"
                      className="border-b border-gray-100 px-3 py-2 text-left font-medium text-gray-800 whitespace-nowrap"
                    >
                      出社率
                    </th>
                    {days.map((day) => (
                      <td
                        key={day.date}
                        className="border-b border-gray-100 px-3 py-2 text-center text-blue-700"
                      >
                        {formatPercent(day.officeRate)}
                      </td>
                    ))}
                  </tr>
                  {/* 在宅率（要件 4.5） */}
                  <tr className="odd:bg-white even:bg-gray-50">
                    <th
                      scope="row"
                      className="px-3 py-2 text-left font-medium text-gray-800 whitespace-nowrap"
                    >
                      在宅率
                    </th>
                    {days.map((day) => (
                      <td
                        key={day.date}
                        className="px-3 py-2 text-center text-green-700"
                      >
                        {formatPercent(day.remoteRate)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 日付を選択して出社者一覧を確認する導線（要件 4.6） */}
            <p className="mt-3 text-sm text-gray-500">日付を選択すると、その日の出社者一覧を表示します。</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {days.map((day) => {
                const isSelected = day.date === selectedDate;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => void loadAttendees(day.date)}
                    aria-pressed={isSelected}
                    className={
                      'rounded border px-3 py-1.5 text-sm transition-colors ' +
                      (isSelected
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50')
                    }
                  >
                    {formatDateJa(day.date)}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 日別出社者一覧（要件 4.6、4.7） */}
          {selectedDate && (
            <section aria-labelledby="attendees-heading">
              <h2 id="attendees-heading" className="mb-3 text-lg font-semibold text-gray-800">
                {formatDateJa(selectedDate)} の出社者一覧
              </h2>

              {/* 取得失敗メッセージ（要件 4.6） */}
              {attendeesError && (
                <div
                  role="alert"
                  className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {attendeesError}
                </div>
              )}

              {isAttendeesLoading ? (
                <div className="rounded border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                  読み込み中...
                </div>
              ) : attendees && attendees.length > 0 ? (
                <ul className="divide-y divide-gray-100 rounded border border-gray-200 bg-white">
                  {attendees.map((attendee) => (
                    <li key={attendee.userId} className="px-3 py-2">
                      <span className="font-medium text-gray-800">{attendee.name}</span>
                      <span className="ml-2 text-sm text-gray-500">{attendee.email}</span>
                    </li>
                  ))}
                </ul>
              ) : attendees && attendees.length === 0 && !attendeesError ? (
                // 出社登録者が 1 人も存在しない旨のメッセージ（要件 4.7）。
                <div className="rounded border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                  この日に出社を登録した従業員はいません。
                </div>
              ) : null}
            </section>
          )}

          {/* しきい値設定フォーム（要件 4.3、4.4） */}
          <section aria-labelledby="threshold-heading">
            <h2 id="threshold-heading" className="mb-3 text-lg font-semibold text-gray-800">
              しきい値設定
            </h2>
            <div className="rounded border border-gray-200 bg-white p-4">
              {threshold && (
                <p className="mb-3 text-sm text-gray-500">
                  現在の設定: 出社上限 {threshold.upperThreshold} / 出社下限{' '}
                  {threshold.lowerThreshold}
                </p>
              )}

              {/* 更新失敗メッセージ（サーバーの日本語メッセージを優先。要件 4.4） */}
              {thresholdError && (
                <div
                  role="alert"
                  className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {thresholdError}
                </div>
              )}

              {/* 更新成功メッセージ（要件 4.3） */}
              {thresholdSuccess && (
                <div
                  role="status"
                  className="mb-3 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700"
                >
                  {thresholdSuccess}
                </div>
              )}

              <form onSubmit={handleThresholdSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex flex-col gap-1">
                  <label htmlFor="upper-threshold" className="text-sm text-gray-600">
                    出社上限しきい値
                  </label>
                  <input
                    id="upper-threshold"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={upperInput}
                    onChange={(event) => setUpperInput(event.target.value)}
                    disabled={isSaving}
                    className="w-32 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="lower-threshold" className="text-sm text-gray-600">
                    出社下限しきい値
                  </label>
                  <input
                    id="lower-threshold"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={lowerInput}
                    onChange={(event) => setLowerInput(event.target.value)}
                    disabled={isSaving}
                    className="w-32 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
              </form>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
