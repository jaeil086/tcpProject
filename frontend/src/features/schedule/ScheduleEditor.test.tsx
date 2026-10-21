// Feature: ai-team-planner
// ScheduleEditor（勤務予定登録・更新画面）の例示テスト（タスク 14.3）。
//
// 検証観点:
// - 未登録表示: workLocation=null の日に「未登録」インジケータが出る（要件 2.6/3.6 近傍）。
// - フォーム一次バリデーション: 勤務区分はドロップダウン（select）で、選択肢は
//   出社／テレワーク／青山／その他／休暇の 5 値。対象は Target_Week の平日 5 日のみ
//   （自由入力の日付欄が無い）である（要件 2.3、2.5 の一次抑止）。
//   「出社」選択で upsertMySchedule が { date, workLocation: 'office' } で呼ばれる。
// - 保存失敗時の既存表示不変: 保存が ApiError で失敗しても日本語メッセージを表示しつつ、
//   直前まで表示していた日は消えない（既存状態を保持する）。

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleEditor } from './ScheduleEditor';
import { ApiError } from '../../api';
import { WorkLocation, type WeekSchedule } from '../../types';

// api バレルをモックし、ネットワーク／DB 非依存でコンポーネントを検証する。
// ApiError は実クラスを使いたいため、実モジュールから引き継ぐ。
vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    schedulesApi: {
      getMySchedule: vi.fn(),
      upsertMySchedule: vi.fn(),
    },
  };
});

// モック済み関数を型付きで取得するためのヘルパー。
async function getMocks() {
  const { schedulesApi } = await import('../../api');
  return schedulesApi as unknown as {
    getMySchedule: ReturnType<typeof vi.fn>;
    upsertMySchedule: ReturnType<typeof vi.fn>;
  };
}

// テスト用の週次勤務予定（Target_Week 平日 5 日分・月〜金）。
// 月曜=office、火曜=remote、水〜金は未登録（null）とする。
const WEEK_SCHEDULE: WeekSchedule = {
  weekStart: '2024-05-13',
  days: [
    { date: '2024-05-13', workLocation: WorkLocation.Office }, // 月
    { date: '2024-05-14', workLocation: WorkLocation.Remote }, // 火
    { date: '2024-05-15', workLocation: null }, // 水（未登録）
    { date: '2024-05-16', workLocation: null }, // 木（未登録）
    { date: '2024-05-17', workLocation: null }, // 金（未登録）
  ],
};

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ScheduleEditor', () => {
  it('未登録日には「未登録」表示、登録済み日には対応する勤務区分がドロップダウンに反映される', async () => {
    const mocks = await getMocks();
    mocks.getMySchedule.mockResolvedValue(WEEK_SCHEDULE);

    render(<ScheduleEditor />);

    // 非同期読込の完了を待つ（平日 5 日分の行が描画される）。
    const mondaySelect = await screen.findByRole('combobox', {
      name: '5月13日（月）の勤務区分',
    });

    // 未登録（null）の 3 日分（水・木・金）に「未登録」インジケータが出る。
    expect(screen.getAllByText('未登録')).toHaveLength(3);

    // 月曜（office）はドロップダウンの値が 'office'。
    expect(mondaySelect).toHaveValue(WorkLocation.Office);

    // 火曜（remote）はドロップダウンの値が 'remote'。
    const tuesdaySelect = screen.getByRole('combobox', { name: '5月14日（火）の勤務区分' });
    expect(tuesdaySelect).toHaveValue(WorkLocation.Remote);
  });

  it('選択肢は 5 値（出社/テレワーク/青山/その他/休暇）・対象は平日 5 日のみで、「出社」選択で upsert が正しい引数で呼ばれる', async () => {
    const mocks = await getMocks();
    mocks.getMySchedule.mockResolvedValue(WEEK_SCHEDULE);
    mocks.upsertMySchedule.mockResolvedValue({
      success: true,
      date: '2024-05-15',
      workLocation: WorkLocation.Office,
    });

    const user = userEvent.setup();
    render(<ScheduleEditor />);

    await screen.findByRole('combobox', { name: '5月13日（月）の勤務区分' });

    // 勤務区分ドロップダウンは平日 5 日分（= 5 個の combobox）。
    expect(screen.getAllByRole('combobox')).toHaveLength(5);

    // 各ドロップダウンには 5 区分の選択肢がすべて含まれる（出社/テレワーク/青山/その他/休暇）。
    const mondaySelect = screen.getByRole('combobox', { name: '5月13日（月）の勤務区分' });
    for (const label of ['出社', 'テレワーク', '青山', 'その他', '休暇']) {
      expect(
        within(mondaySelect).getByRole('option', { name: label }),
      ).toBeInTheDocument();
    }

    // 対象は Target_Week の平日 5 日のみ（自由入力の日付欄は存在しない）。
    expect(document.querySelector('input[type="date"]')).toBeNull();

    // 水曜（未登録）で「出社」を選ぶと upsert が { date, workLocation: 'office' } で呼ばれる。
    const wednesdaySelect = screen.getByRole('combobox', { name: '5月15日（水）の勤務区分' });
    await user.selectOptions(wednesdaySelect, WorkLocation.Office);

    await waitFor(() => {
      expect(mocks.upsertMySchedule).toHaveBeenCalledWith({
        date: '2024-05-15',
        workLocation: WorkLocation.Office,
      });
    });
  });

  it('青山／休暇など新しい区分も選択でき、upsert が正しい値で呼ばれる', async () => {
    const mocks = await getMocks();
    mocks.getMySchedule.mockResolvedValue(WEEK_SCHEDULE);
    mocks.upsertMySchedule.mockResolvedValue({
      success: true,
      date: '2024-05-16',
      workLocation: WorkLocation.Aoyama,
    });

    const user = userEvent.setup();
    render(<ScheduleEditor />);

    await screen.findByRole('combobox', { name: '5月13日（月）の勤務区分' });

    // 木曜（未登録）で「青山」を選ぶと upsert が { date, workLocation: 'aoyama' } で呼ばれる。
    const thursdaySelect = screen.getByRole('combobox', { name: '5月16日（木）の勤務区分' });
    await user.selectOptions(thursdaySelect, WorkLocation.Aoyama);

    await waitFor(() => {
      expect(mocks.upsertMySchedule).toHaveBeenCalledWith({
        date: '2024-05-16',
        workLocation: WorkLocation.Aoyama,
      });
    });
  });

  it('保存失敗時は日本語エラーを表示しつつ、既存の表示（平日 5 日分）を保持する', async () => {
    const mocks = await getMocks();
    mocks.getMySchedule.mockResolvedValue(WEEK_SCHEDULE);
    // 400（対象範囲外・不正値相当）でサーバーの日本語メッセージを返して拒否する。
    mocks.upsertMySchedule.mockRejectedValue(
      new ApiError(400, 'BAD_REQUEST', '対象範囲外の日付です。'),
    );

    const user = userEvent.setup();
    render(<ScheduleEditor />);

    await screen.findByRole('combobox', { name: '5月13日（月）の勤務区分' });

    const wednesdaySelect = screen.getByRole('combobox', { name: '5月15日（水）の勤務区分' });
    await user.selectOptions(wednesdaySelect, WorkLocation.Remote);

    // 保存失敗の日本語メッセージが alert として表示される。
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('対象範囲外の日付です。');

    // 既存の表示は消えない: 平日 5 日分のドロップダウンが引き続き存在する。
    expect(screen.getAllByRole('combobox')).toHaveLength(5);
    // 元々 office だった月曜の選択状態も保持されている。
    const mondaySelect = screen.getByRole('combobox', { name: '5月13日（月）の勤務区分' });
    expect(mondaySelect).toHaveValue(WorkLocation.Office);
  });
});
