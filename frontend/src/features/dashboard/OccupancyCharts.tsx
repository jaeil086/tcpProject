// Feature: ai-team-planner
// 管理者ダッシュボードの勤務状況を Recharts で可視化するグラフ群。
//
// 設計方針:
// - 日別 出社/テレワーク人数の積み上げ棒グラフ（BarChart）と、週全体の出社/テレワーク比率の
//   ドーナツグラフ（PieChart + innerRadius）を提供する。
// - データ源は GET /dashboard/occupancy のレスポンス（DashboardOccupancy）をそのまま用い、
//   追加の API 取得は行わない（表と同じデータを可視化する）。
// - 配色は既存表の配色（出社=青系、テレワーク=緑系）に合わせて一貫性を保つ。
// - ResponsiveContainer で親要素幅に追従させ、各種ラベルは日本語で表示する。

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDateJa } from '../../lib/date';
import type { DashboardOccupancy } from '../../types';

/** 出社（神田）系の配色（既存表の text-blue-700 と調和する青）。 */
const OFFICE_COLOR = '#2563eb';
/** テレワーク系の配色（既存表の text-green-700 と調和する緑）。 */
const REMOTE_COLOR = '#16a34a';
/** 青山（本社）系の配色（紫）。 */
const AOYAMA_COLOR = '#9333ea';
/** その他系の配色（アンバー）。 */
const OTHER_COLOR = '#d97706';
/** 休暇系の配色（ピンク）。 */
const VACATION_COLOR = '#db2777';

/**
 * 棒グラフ用に、日別の各勤務区分の人数を整形する。
 * x 軸ラベルは日本語の日付（例: 10月26日（月））とする。
 */
function toBarData(occupancy: DashboardOccupancy) {
  return occupancy.days.map((day) => ({
    date: formatDateJa(day.date),
    office: day.officeCount,
    remote: day.remoteCount,
    aoyama: day.aoyamaCount,
    other: day.otherCount,
    vacation: day.vacationCount,
  }));
}

/**
 * ドーナツグラフ用に、週全体の各勤務区分の人数合計を算出する。
 * 各日の区分別人数を週で合算した 5 区分の比率を表す。
 */
function toPieData(occupancy: DashboardOccupancy) {
  const sum = (pick: (d: DashboardOccupancy['days'][number]) => number) =>
    occupancy.days.reduce((acc, day) => acc + pick(day), 0);
  return [
    { name: '出社', value: sum((d) => d.officeCount), color: OFFICE_COLOR },
    { name: 'テレワーク', value: sum((d) => d.remoteCount), color: REMOTE_COLOR },
    { name: '青山', value: sum((d) => d.aoyamaCount), color: AOYAMA_COLOR },
    { name: 'その他', value: sum((d) => d.otherCount), color: OTHER_COLOR },
    { name: '休暇', value: sum((d) => d.vacationCount), color: VACATION_COLOR },
  ];
}

/**
 * 管理者ダッシュボードの勤務状況グラフ（日別棒グラフ + 週次比率ドーナツ）。
 *
 * @param occupancy GET /dashboard/occupancy のレスポンス（表と同一データ）
 */
export function OccupancyCharts({ occupancy }: { occupancy: DashboardOccupancy }) {
  const barData = toBarData(occupancy);
  const pieData = toPieData(occupancy);
  // 週全体で登録が 1 件も無い場合はドーナツを描かず、その旨を表示する。
  const pieTotal = pieData.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* 日別 出社／テレワーク人数（積み上げ棒グラフ） */}
      <div className="rounded border border-gray-200 bg-white p-4 lg:col-span-2">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">日別 勤務区分 人数</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
              />
              <Tooltip
                formatter={(value: number, name: string) => [`${value} 人`, name]}
                contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: '#e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="office" name="出社" stackId="a" fill={OFFICE_COLOR} radius={[0, 0, 0, 0]} />
              <Bar dataKey="remote" name="テレワーク" stackId="a" fill={REMOTE_COLOR} radius={[0, 0, 0, 0]} />
              <Bar dataKey="aoyama" name="青山" stackId="a" fill={AOYAMA_COLOR} radius={[0, 0, 0, 0]} />
              <Bar dataKey="other" name="その他" stackId="a" fill={OTHER_COLOR} radius={[0, 0, 0, 0]} />
              <Bar dataKey="vacation" name="休暇" stackId="a" fill={VACATION_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 週全体の出社／テレワーク比率（ドーナツ） */}
      <div className="rounded border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">週全体の勤務区分 比率</h3>
        {/* 凡例（5 区分 + 比率）が複数行になっても収まるよう高さに余裕を持たせる。 */}
        <div className="h-72 w-full">
          {pieTotal === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
              対象週に登録された勤務予定がありません。
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  // 区分が多く小さな値も混在するため、スライス上のラベルは描かない
                  // （文字の重なり・はみ出しを防ぐ）。比率は凡例とツールチップで示す。
                  isAnimationActive={false}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} 人`, name]}
                  contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: '#e5e7eb' }}
                />
                {/* 凡例に「区分名 比率%」を表示する（スライス上ラベルの代替）。 */}
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value: string) => {
                    const entry = pieData.find((d) => d.name === value);
                    const percent =
                      entry && pieTotal > 0
                        ? Math.round((entry.value / pieTotal) * 100)
                        : 0;
                    return `${value} ${percent}%`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

export default OccupancyCharts;
