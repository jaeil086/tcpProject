// Feature: ai-team-planner
// チーム週次カレンダー画面（TeamCalendar、要件 3.1〜3.7）。
//
// 設計方針:
// - マウント時にチーム一覧（GET /teams）と自チームのカレンダー（GET /calendar、teamId 省略）を
//   取得する。teamId を省略するとサーバーが認証済みユーザーの所属チームを既定対象として返す
//   （要件 3.4）。取得中はローディング表示を出す。
// - チーム選択（要件 3.3）: チーム一覧をプルダウンで提示する。選択を変更すると
//   GET /calendar?teamId= を再取得し、当該チームのメンバーのみ表示する。既定の選択は
//   カレンダー応答の teamId（自チーム）を反映する（要件 3.4）。
// - カレンダーグリッド（要件 3.1、3.6）: Target_Week の平日 5 日を列、メンバーを行として
//   <table> で描画する。各セルは当該日の勤務区分（出社／在宅／未登録）を表示する。
//   未登録（workLocation=null）は視覚的に区別できる「未登録」表示にする（要件 3.6）。
// - Occupancy_Count 行（要件 3.2）: occupancyByDate の日別 officeCount を集計行として表示する。
// - 空状態（要件 3.5）: 対象週に登録済みの勤務予定が 1 件も存在しない場合（メンバー不在、
//   または全メンバーの全日が未登録）は、勤務予定が未登録である旨のメッセージを表示する。
// - 取得エラー（要件 3.7）: カレンダー取得に失敗した場合は日本語のエラーメッセージを
//   バナー表示し、直前まで表示していたカレンダーは保持する（表示内容を変更しない）。

import { useCallback, useEffect, useState } from 'react';
import { ApiError, calendarApi } from '../../api';
import { useAuth } from '../../auth';
import { formatDateJa } from '../../lib/date';
import {
  WorkLocation,
  type CalendarResponse,
  type Team,
  type WorkLocation as WorkLocationValue,
} from '../../types';

/**
 * カレンダー取得失敗時のユーザー向け日本語メッセージへ変換する（要件 3.7）。
 */
function toCalendarErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return '勤務予定データの取得に失敗しました。時間をおいて再度お試しください。';
}

/**
 * 勤務区分（office/remote/null）を表示用のラベルとスタイルへ変換する（要件 3.6）。
 */
function renderWorkLocation(workLocation: WorkLocationValue | null): {
  label: string;
  className: string;
} {
  switch (workLocation) {
    case WorkLocation.Office:
      return { label: '出社', className: 'bg-blue-100 text-blue-800' };
    case WorkLocation.Remote:
      return { label: 'テレワーク', className: 'bg-green-100 text-green-800' };
    default:
      // 未登録（null）は淡色で区別表示する（要件 3.6）。
      return { label: '未登録', className: 'bg-gray-50 text-gray-400' };
  }
}

/**
 * カレンダー応答に登録済みの勤務予定が 1 件も存在しないかどうかを判定する（要件 3.5）。
 * メンバー不在、または全メンバーの全日が未登録（workLocation=null）であれば空とみなす。
 */
function isCalendarEmpty(calendar: CalendarResponse): boolean {
  if (calendar.members.length === 0) {
    return true;
  }
  return calendar.members.every((member) =>
    member.days.every((day) => day.workLocation === null),
  );
}

/**
 * チームカレンダー画面コンポーネント。
 */
export function TeamCalendar() {
  const { user } = useAuth();

  // チーム一覧（チーム選択プルダウン用）。
  const [teams, setTeams] = useState<Team[]>([]);
  // 直近に取得できたカレンダー（取得失敗時も保持し続ける。要件 3.7）。
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  // 現在選択中のチーム ID（未選択＝自チーム既定は null で表す。要件 3.4）。
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  // 初回読込中フラグ。
  const [isLoading, setIsLoading] = useState(true);
  // カレンダー取得失敗メッセージ（失敗時のみ設定。要件 3.7）。
  const [fetchError, setFetchError] = useState<string | null>(null);

  // マウント時にチーム一覧を取得し、表示対象チームを決めてそのカレンダーを取得する（要件 3.3、3.4）。
  //
  // 重要: 「ドロップダウンで選択中のチーム」と「実際に取得したカレンダーの対象チーム」を必ず一致させる。
  // 以前は teamId を省略して自チームのカレンダーを取得していたため、
  // 自チームが無いユーザー（例: 未所属の最上位管理者）では、ドロップダウンの表示チームと
  // 取得データがずれ、初回に空表示になる不具合があった。
  // そこで、表示対象チーム（自チーム → 無ければチーム一覧の先頭）を先に決め、
  // その teamId を明示してカレンダーを取得する。
  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setIsLoading(true);
      setFetchError(null);
      try {
        // まずチーム一覧を取得する。
        const teamList = await calendarApi.getTeams();
        if (cancelled) {
          return;
        }
        setTeams(teamList);

        // 表示対象チームを決定する:
        // 1) 自分の所属チームがチーム一覧に含まれていればそれを優先
        // 2) 無ければチーム一覧の先頭（要件 3.3 / 本対応の方針）
        const ownTeam = teamList.find((team) => team.id === user?.teamId);
        const defaultTeam = ownTeam ?? teamList[0] ?? null;

        if (!defaultTeam) {
          // チームが 1 つも存在しない場合は、空表示のまま終える。
          setSelectedTeamId(null);
          setCalendar(null);
          return;
        }

        // 選択チームを確定し、その teamId を明示してカレンダーを取得する（表示とデータを一致させる）。
        setSelectedTeamId(defaultTeam.id);
        const initialCalendar = await calendarApi.getCalendar({ teamId: defaultTeam.id });
        if (!cancelled) {
          setCalendar(initialCalendar);
        }
      } catch (error) {
        if (!cancelled) {
          // 初回はまだ保持データが無いため、エラーのみ設定する（要件 3.7）。
          setFetchError(toCalendarErrorMessage(error));
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
  }, [user?.teamId]);

  /**
   * 選択チームのカレンダーを再取得する（要件 3.3）。
   * 失敗時は既存の表示（calendar）を変更せず、エラーメッセージのみ設定する（要件 3.7）。
   */
  const loadCalendarForTeam = useCallback(async (teamId: string) => {
    setFetchError(null);
    try {
      const result = await calendarApi.getCalendar({ teamId });
      setCalendar(result);
    } catch (error) {
      // 取得失敗時は直前の表示内容を保持する（要件 3.7）。
      setFetchError(toCalendarErrorMessage(error));
    }
  }, []);

  /**
   * チーム選択変更時のハンドラ（要件 3.3）。
   */
  const handleTeamChange = useCallback(
    (teamId: string) => {
      setSelectedTeamId(teamId);
      void loadCalendarForTeam(teamId);
    },
    [loadCalendarForTeam],
  );

  // 表示対象の日付列（Target_Week 平日 5 日分）。カレンダーが無ければ空配列。
  const dates = calendar?.occupancyByDate.map((entry) => entry.date) ?? [];
  // 日付 → officeCount の対応表（Occupancy_Count 行の描画用。要件 3.2）。
  const occupancyByDate = new Map(
    calendar?.occupancyByDate.map((entry) => [entry.date, entry.officeCount]) ?? [],
  );

  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">チームカレンダー</h1>
          <p className="mt-1 text-sm text-gray-500">
            チーム全体の翌週（月曜〜金曜、平日）の勤務予定を確認できます。
          </p>
          {/* 選択中チームの総人数（メンバー数） */}
          {calendar && (
            <p className="mt-1 text-sm text-gray-600">
              チーム人数:{' '}
              <span className="font-semibold text-gray-900">{calendar.members.length}</span> 名
            </p>
          )}
        </div>

        {/* チーム選択プルダウン（要件 3.3、3.4） */}
        <div className="flex items-center gap-2">
          <label htmlFor="team-select" className="text-sm text-gray-600">
            チーム
          </label>
          <select
            id="team-select"
            value={selectedTeamId ?? ''}
            onChange={(event) => handleTeamChange(event.target.value)}
            disabled={isLoading || teams.length === 0}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            {/* 自チームがチーム一覧に含まれない場合に備えたフォールバック表示 */}
            {teams.length === 0 && <option value="">（チームなし）</option>}
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* 取得失敗メッセージ（既存表示は保持したままバナーのみ表示。要件 3.7） */}
      {fetchError && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {fetchError}
        </div>
      )}

      {/* 読込中の状態表示 */}
      {isLoading && !calendar && (
        <div className="rounded border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          読み込み中...
        </div>
      )}

      {/* 空状態: 登録済みの勤務予定が 1 件も存在しない（要件 3.5） */}
      {!isLoading && calendar && isCalendarEmpty(calendar) && (
        <div className="rounded border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          対象週の勤務予定は未登録です。
        </div>
      )}

      {/* カレンダーグリッド（要件 3.1、3.2、3.6） */}
      {!isLoading && calendar && !isCalendarEmpty(calendar) && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th
                  scope="col"
                  className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600"
                >
                  メンバー
                </th>
                {dates.map((date) => (
                  <th
                    key={date}
                    scope="col"
                    className="border-b border-gray-200 px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap"
                  >
                    {formatDateJa(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendar.members.map((member) => (
                <tr key={member.userId} className="odd:bg-white even:bg-gray-50">
                  <th
                    scope="row"
                    className="border-b border-gray-100 px-3 py-2 text-left font-medium text-gray-800 whitespace-nowrap"
                  >
                    {member.name}
                  </th>
                  {member.days.map((day) => {
                    const { label, className } = renderWorkLocation(day.workLocation);
                    return (
                      <td
                        key={day.date}
                        className="border-b border-gray-100 px-3 py-2 text-center"
                      >
                        <span
                          className={
                            'inline-block rounded px-2 py-0.5 text-xs ' + className
                          }
                        >
                          {label}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              {/* Occupancy_Count 行（当日 office 登録者数。要件 3.2） */}
              <tr className="bg-gray-100">
                <th
                  scope="row"
                  className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap"
                >
                  出社人数
                </th>
                {dates.map((date) => (
                  <td
                    key={date}
                    className="px-3 py-2 text-center font-semibold text-gray-800"
                  >
                    {occupancyByDate.get(date) ?? 0}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default TeamCalendar;
