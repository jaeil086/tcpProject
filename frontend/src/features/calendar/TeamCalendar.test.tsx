// Feature: ai-team-planner
// TeamCalendar（チーム週次カレンダー画面）の例示テスト（タスク 14.3）。
//
// 検証観点:
// - 空状態メッセージ: 対象週に登録済みの勤務予定が 1 件も無い場合、未登録である旨の
//   メッセージを表示する（要件 3.5）。
// - 未登録セル表示: office/remote/null が混在するとき、各セルに「出社」「在宅」「未登録」を
//   適切に表示し、Occupancy_Count 行に officeCount を表示する（要件 3.2、3.6）。
// - 取得失敗で既存表示不変: チーム変更で再取得が ApiError で失敗した場合、エラーバナーを
//   表示しつつ直前まで表示していたカレンダーは保持する（要件 3.7）。

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamCalendar } from './TeamCalendar';
import { ApiError } from '../../api';
import {
  WorkLocation,
  type CalendarResponse,
  type Team,
  type UserProfile,
} from '../../types';

// api バレルをモックする（ApiError の実クラスは引き継ぐ）。
vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    calendarApi: {
      getTeams: vi.fn(),
      getCalendar: vi.fn(),
    },
  };
});

// useAuth をモックし、teamId を持つユーザーを返す。
vi.mock('../../auth', () => ({
  useAuth: vi.fn(),
}));

async function getApiMocks() {
  const { calendarApi } = await import('../../api');
  return calendarApi as unknown as {
    getTeams: ReturnType<typeof vi.fn>;
    getCalendar: ReturnType<typeof vi.fn>;
  };
}

async function getAuthMock() {
  const { useAuth } = await import('../../auth');
  return useAuth as unknown as ReturnType<typeof vi.fn>;
}

// teamId を持つログインユーザー（最小限のプロフィール）。
const USER: UserProfile = {
  id: 'u-self',
  cognitoSub: 'sub-self',
  email: 'self@example.com',
  name: '自分',
  role: 'employee',
  teamId: 'team-1',
  teamName: 'チームA',
};

const TEAMS: Team[] = [
  { id: 'team-1', name: 'チームA' },
  { id: 'team-2', name: 'チームB' },
];

// office/remote/null が混在するカレンダー（Target_Week 平日 5 日・月〜金）。
const CALENDAR_MIXED: CalendarResponse = {
  weekStart: '2024-05-13',
  teamId: 'team-1',
  members: [
    {
      userId: 'u-1',
      name: '田中',
      days: [
        { date: '2024-05-13', workLocation: WorkLocation.Office }, // 月
        { date: '2024-05-14', workLocation: WorkLocation.Remote }, // 火
        { date: '2024-05-15', workLocation: null }, // 水
        { date: '2024-05-16', workLocation: null }, // 木
        { date: '2024-05-17', workLocation: null }, // 金
      ],
    },
  ],
  occupancyByDate: [
    { date: '2024-05-13', officeCount: 1 },
    { date: '2024-05-14', officeCount: 0 },
    { date: '2024-05-15', officeCount: 0 },
    { date: '2024-05-16', officeCount: 0 },
    { date: '2024-05-17', officeCount: 0 },
  ],
};

// メンバー不在（空状態）のカレンダー。
const CALENDAR_EMPTY: CalendarResponse = {
  weekStart: '2024-05-13',
  teamId: 'team-1',
  members: [],
  occupancyByDate: CALENDAR_MIXED.occupancyByDate,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('TeamCalendar', () => {
  it('登録済み勤務予定が 0 件のとき、未登録である旨の空状態メッセージを表示する', async () => {
    const auth = await getAuthMock();
    auth.mockReturnValue({ user: USER });
    const mocks = await getApiMocks();
    mocks.getTeams.mockResolvedValue(TEAMS);
    mocks.getCalendar.mockResolvedValue(CALENDAR_EMPTY);

    render(<TeamCalendar />);

    expect(await screen.findByText('対象週の勤務予定は未登録です。')).toBeInTheDocument();
  });

  it('office/remote/null 混在時、各セルに「出社」「在宅」「未登録」を表示し、出社人数行に officeCount を表示する', async () => {
    const auth = await getAuthMock();
    auth.mockReturnValue({ user: USER });
    const mocks = await getApiMocks();
    mocks.getTeams.mockResolvedValue(TEAMS);
    mocks.getCalendar.mockResolvedValue(CALENDAR_MIXED);

    render(<TeamCalendar />);

    // メンバー行が描画されるのを待つ。
    await screen.findByText('田中');

    // 月曜=出社、火曜=在宅、残り 3 日（水・木・金）は未登録。
    expect(screen.getByText('出社')).toBeInTheDocument();
    expect(screen.getByText('在宅')).toBeInTheDocument();
    expect(screen.getAllByText('未登録')).toHaveLength(3);

    // Occupancy_Count 行（出社人数）に月曜の officeCount=1 が表示される。
    const occupancyRow = screen.getByRole('row', { name: /出社人数/ });
    expect(within(occupancyRow).getByText('1')).toBeInTheDocument();
  });

  it('チーム変更での再取得が失敗しても、エラーバナーを表示しつつ既存のカレンダー表示を保持する', async () => {
    const auth = await getAuthMock();
    auth.mockReturnValue({ user: USER });
    const mocks = await getApiMocks();
    mocks.getTeams.mockResolvedValue(TEAMS);
    // 初回は成功、2 回目（チーム変更後）は ApiError で失敗する。
    mocks.getCalendar
      .mockResolvedValueOnce(CALENDAR_MIXED)
      .mockRejectedValueOnce(
        new ApiError(500, 'INTERNAL_ERROR', 'サーバーエラーが発生しました。'),
      );

    const user = userEvent.setup();
    render(<TeamCalendar />);

    // 初回カレンダー（田中）が描画される。
    await screen.findByText('田中');

    // チームを team-2 に変更 → 再取得が失敗する。
    await user.selectOptions(screen.getByLabelText('チーム'), 'team-2');

    // エラーバナーが表示される。
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('サーバーエラーが発生しました。');

    // 直前まで表示していたカレンダー（田中の行）は保持されている。
    expect(screen.getByText('田中')).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.getCalendar).toHaveBeenCalledTimes(2);
    });
  });
});
