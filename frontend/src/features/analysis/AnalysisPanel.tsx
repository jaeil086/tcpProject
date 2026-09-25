// Feature: ai-team-planner
// AI 分析パネル画面（AnalysisPanel、要件 5.1、5.5、5.6）。
//
// 設計方針:
// - 「分析を実行」ボタンで POST /analysis/run（runAnalysis）を呼び出す（要件 5.1）。
//   実行中はボタンを無効化し、実行中である旨を表示する。
// - 成功かつ hasData=true の場合（要件 5.5）:
//   - すべての警告（warnings[]）を表示する。各警告は対象日（formatDateJa）、
//     種別ラベル（過多／過少）、Occupancy_Count、メッセージを含む。
//     over_capacity（過多）と under_capacity（過少）は配色で視覚的に区別する。
//     警告が 1 件も存在しない場合は「警告はありません」と表示する。
//   - 日別パターン要約（summary[]、平日 5 日分）を出社人数（出社）・在宅人数（在宅）とともに表示する。
// - 成功かつ hasData=false の場合（要件 5.6）: 対象なしメッセージ（response.message、
//   未設定時は既定の日本語メッセージ）を表示し、警告・要約セクションは描画しない。
// - 失敗（ApiError）時: 日本語のエラーメッセージを表示する。
// - 管理者専用アクセス（要件 4.2）は ProtectedRoute（requiredRole=Administrator）が担うため、
//   本コンポーネントでは追加の権限制御は行わない。

import { useCallback, useState } from 'react';
import { ApiError, analysisApi } from '../../api';
import { formatDateJa } from '../../lib/date';
import type { AnalysisRunResponse, AnalysisWarning } from '../../types';

/**
 * 分析実行失敗時のユーザー向け日本語メッセージへ変換する（要件 5.1）。
 * サーバーの日本語メッセージがあればそれを優先する。
 */
function toAnalysisErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return 'AI 分析の実行に失敗しました。時間をおいて再度お試しください。';
}

/** 警告種別の日本語ラベル（過多／過少）。 */
function warningTypeLabel(type: AnalysisWarning['type']): string {
  return type === 'over_capacity' ? '過多' : '過少';
}

/**
 * AI 分析パネル画面コンポーネント。
 */
export function AnalysisPanel() {
  // 分析結果（未実行時は null）。
  const [result, setResult] = useState<AnalysisRunResponse | null>(null);
  // 実行中フラグ（要件 5.1）。
  const [isRunning, setIsRunning] = useState(false);
  // 実行失敗メッセージ（要件 5.1）。
  const [error, setError] = useState<string | null>(null);

  /**
   * 「分析を実行」ボタン押下時のハンドラ（要件 5.1）。
   * weekStart は省略（＝翌週 Target_Week）で runAnalysis を呼び出す。
   */
  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    try {
      const response = await analysisApi.runAnalysis();
      setResult(response);
    } catch (err) {
      // 失敗時は結果をクリアし、エラーメッセージのみ設定する。
      setResult(null);
      setError(toAnalysisErrorMessage(err));
    } finally {
      setIsRunning(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-4">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">AI 分析</h1>
        <p className="mt-1 text-sm text-gray-500">
          翌週（月曜〜金曜、平日）の勤務予定をもとに、出社人員の過多／過少の警告と日別パターンを確認できます。
        </p>
      </header>

      {/* 分析実行ボタン（要件 5.1） */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={isRunning}
          aria-busy={isRunning}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {isRunning ? '分析を実行中...' : '分析を実行'}
        </button>
      </div>

      {/* 実行失敗メッセージ（要件 5.1） */}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* 実行中の状態表示 */}
      {isRunning && (
        <div className="rounded border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          分析を実行中です...
        </div>
      )}

      {/* 対象なしメッセージ（hasData=false。要件 5.6） */}
      {!isRunning && result && !result.hasData && (
        <div
          role="status"
          className="rounded border border-gray-200 bg-white p-6 text-center text-sm text-gray-600"
        >
          {result.message ?? '分析対象のデータがありません。'}
        </div>
      )}

      {/* 分析結果（hasData=true。要件 5.5） */}
      {!isRunning && result && result.hasData && (
        <div className="flex flex-col gap-8">
          {/* 過多／過少警告の一覧（要件 5.5） */}
          <section aria-labelledby="warnings-heading">
            <h2 id="warnings-heading" className="mb-3 text-lg font-semibold text-gray-800">
              警告
            </h2>
            {result.warnings.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {result.warnings.map((warning) => {
                  const isOver = warning.type === 'over_capacity';
                  return (
                    <li
                      key={`${warning.date}-${warning.type}`}
                      className={
                        'rounded border px-3 py-2 text-sm ' +
                        (isOver
                          ? 'border-red-300 bg-red-50 text-red-800'
                          : 'border-amber-300 bg-amber-50 text-amber-800')
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{formatDateJa(warning.date)}</span>
                        <span
                          className={
                            'rounded px-2 py-0.5 text-xs font-medium ' +
                            (isOver ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900')
                          }
                        >
                          {warningTypeLabel(warning.type)}
                        </span>
                        <span className="text-xs text-gray-600">
                          出社人数: {warning.occupancyCount}
                        </span>
                      </div>
                      <p className="mt-1">{warning.message}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              // 警告が 1 件も存在しない旨のメッセージ（要件 5.5）。
              <div className="rounded border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                警告はありません。
              </div>
            )}
          </section>

          {/* 日別パターン要約（要件 5.5） */}
          <section aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="mb-3 text-lg font-semibold text-gray-800">
              日別パターン
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
                    {result.summary.map((day) => (
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
                  {/* 出社人数（出社。要件 5.5） */}
                  <tr className="odd:bg-white even:bg-gray-50">
                    <th
                      scope="row"
                      className="border-b border-gray-100 px-3 py-2 text-left font-medium text-gray-800 whitespace-nowrap"
                    >
                      出社
                    </th>
                    {result.summary.map((day) => (
                      <td
                        key={day.date}
                        className="border-b border-gray-100 px-3 py-2 text-center font-semibold text-blue-700"
                      >
                        {day.officeCount}
                      </td>
                    ))}
                  </tr>
                  {/* 在宅人数（在宅。要件 5.5） */}
                  <tr className="odd:bg-white even:bg-gray-50">
                    <th
                      scope="row"
                      className="px-3 py-2 text-left font-medium text-gray-800 whitespace-nowrap"
                    >
                      在宅
                    </th>
                    {result.summary.map((day) => (
                      <td key={day.date} className="px-3 py-2 text-center font-semibold text-green-700">
                        {day.remoteCount}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default AnalysisPanel;
