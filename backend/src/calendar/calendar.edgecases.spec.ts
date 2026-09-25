import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Schedule } from '../entities/schedule.entity';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/enums';
import { UsersService } from '../users/users.service';
import { TeamsService } from '../teams/teams.service';
import { CalendarService } from './calendar.service';

/**
 * カレンダー集約の例示・エッジケーステスト（要件 3.5、3.7）。
 *
 * 目的:
 *  - 対象週に登録済みの勤務予定が 1 件も存在しない場合の「未登録」を表すデータ形状を検証する（要件 3.5）。
 *    サービス層では「全メンバー・全日 workLocation=null」かつ「Occupancy_Count が全日 0」が
 *    フロントエンドの未登録メッセージ表示の根拠となるため、その形状をアサートする。
 *  - 勤務予定データの取得に失敗した場合、getTeamCalendar がエラーを伝播すること（部分的・破損した
 *    データを返さないこと）を検証する（要件 3.7）。
 *
 * 実行方針:
 *  - 実 DB を使わず、依存（UsersService / TeamsService / Schedule リポジトリ）をモック化する。
 *  - これにより環境非依存で常に実行される（スキップされない）。
 *  - 基準日はサーバー現在日から導出されるため、具体的な日付はアサートせず、
 *    「平日 5 日分である」「null / 0 である」という不変条件のみを検証する。
 */

// テスト用のダミーメンバーを生成する。氏名・ID は English 識別子の値だが日本語も許容する。
function makeMember(id: string, name: string, teamId: string): User {
  return {
    id,
    cognitoSub: `sub-${id}`,
    email: `${id}@example.com`,
    name,
    role: UserRole.Employee,
    teamId,
    team: null,
  } as User;
}

// リクエストユーザーを生成する。
function makeRequester(cognitoSub: string, teamId: string | null): User {
  return {
    id: 'requester-id',
    cognitoSub,
    email: 'requester@example.com',
    name: 'リクエスト太郎',
    role: UserRole.Employee,
    teamId,
    team: null,
  } as User;
}

// モックした依存で CalendarService を組み立てるヘルパー。
function buildService(overrides: {
  findById: jest.Mock;
  getMembersByTeam?: jest.Mock;
  find?: jest.Mock;
}): CalendarService {
  const usersService = {
    findById: overrides.findById,
  } as unknown as UsersService;

  const teamsService = {
    getMembersByTeam: overrides.getMembersByTeam ?? jest.fn(),
  } as unknown as TeamsService;

  const scheduleRepository = {
    find: overrides.find ?? jest.fn(),
  } as unknown as Repository<Schedule>;

  return new CalendarService(scheduleRepository, usersService, teamsService);
}

describe('カレンダー集約の例示・エッジケーステスト（要件 3.5、3.7）', () => {
  const requesterSub = 'edgecase-requester-001';
  const teamId = 'team-001';

  // 例示 1: 対象週に勤務予定が 0 件（要件 3.5）。
  // メンバーは存在するが登録が一切ないため、全メンバー・全日が未登録（null）、
  // Occupancy_Count は全日 0 となる。これがフロントの「未登録メッセージ」表示の根拠。
  it('対象週に勤務予定が 0 件のとき、全メンバー・全日が未登録（null）で Occupancy_Count は全日 0（要件 3.5）', async () => {
    const members = [
      makeMember('user-1', 'メンバー一郎', teamId),
      makeMember('user-2', 'メンバー二郎', teamId),
    ];

    const service = buildService({
      findById: jest.fn().mockResolvedValue(makeRequester(requesterSub, teamId)),
      getMembersByTeam: jest.fn().mockResolvedValue(members),
      // 登録済みの勤務予定は 1 件も存在しない。
      find: jest.fn().mockResolvedValue([]),
    });

    const result = await service.getTeamCalendar(requesterSub);

    // 対象チームは解決されていること。
    expect(result.teamId).toBe(teamId);

    // メンバーは 2 名分返る。
    expect(result.members).toHaveLength(2);

    // 各メンバーは Target_Week 平日 5 日分を持ち、すべて未登録（workLocation=null）。
    for (const member of result.members) {
      expect(member.days).toHaveLength(5);
      for (const day of member.days) {
        expect(day.workLocation).toBeNull();
      }
    }

    // Occupancy_Count は平日 5 日分あり、すべて 0（出社登録者がいない）。
    expect(result.occupancyByDate).toHaveLength(5);
    for (const entry of result.occupancyByDate) {
      expect(entry.officeCount).toBe(0);
    }
  });

  // 境界: リクエストユーザーがチーム未所属かつ teamId 未指定のとき、
  // 対象メンバーが存在しないため members は空、Occupancy_Count は平日 5 日分すべて 0（要件 3.5 の空状態経路）。
  it('チーム未所属かつ teamId 未指定のとき、members は空で Occupancy_Count は全日 0（空状態）', async () => {
    const getMembersByTeam = jest.fn();
    const find = jest.fn();

    const service = buildService({
      findById: jest.fn().mockResolvedValue(makeRequester(requesterSub, null)),
      getMembersByTeam,
      find,
    });

    const result = await service.getTeamCalendar(requesterSub);

    // 対象チームが決定できないため teamId は null。
    expect(result.teamId).toBeNull();
    // メンバーは空。
    expect(result.members).toHaveLength(0);
    // Occupancy_Count は平日 5 日分すべて 0。
    expect(result.occupancyByDate).toHaveLength(5);
    for (const entry of result.occupancyByDate) {
      expect(entry.officeCount).toBe(0);
    }

    // 対象チームがないため、メンバー取得・スケジュール取得は呼ばれない。
    expect(getMembersByTeam).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  // 例示 2: 勤務予定データの取得に失敗（要件 3.7）。
  // scheduleRepository.find が失敗した場合、getTeamCalendar はエラーを伝播し、
  // 部分的・破損したデータを返さない（呼び出し側が取得失敗を検知できる）。
  it('勤務予定データの取得に失敗したとき、getTeamCalendar はエラーを伝播する（要件 3.7）', async () => {
    const members = [makeMember('user-1', 'メンバー一郎', teamId)];
    const fetchError = new Error('スケジュール取得に失敗しました');

    const service = buildService({
      findById: jest.fn().mockResolvedValue(makeRequester(requesterSub, teamId)),
      getMembersByTeam: jest.fn().mockResolvedValue(members),
      // 取得失敗を模擬する。
      find: jest.fn().mockRejectedValue(fetchError),
    });

    await expect(service.getTeamCalendar(requesterSub)).rejects.toThrow(
      'スケジュール取得に失敗しました',
    );
  });

  // 境界: リクエストユーザーが未解決（DB 未同期）のとき、ForbiddenException を伝播する。
  it('リクエストユーザーが解決できないとき、ForbiddenException を伝播する', async () => {
    const service = buildService({
      findById: jest.fn().mockResolvedValue(null),
    });

    await expect(service.getTeamCalendar(requesterSub)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
