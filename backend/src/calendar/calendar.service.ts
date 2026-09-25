import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Schedule } from '../entities/schedule.entity';
import { User } from '../entities/user.entity';
import { UsersService } from '../users/users.service';
import { TeamsService } from '../teams/teams.service';
import { resolveTargetWeek } from '../domain/target-week';
import {
  computeOccupancyByDate,
  ScheduleRecord,
} from '../domain/occupancy';
import {
  CalendarMember,
  CalendarResponse,
} from './dto/calendar-response.dto';

/**
 * チーム単位の週次勤務予定を集約するサービス（CalendarModule）。
 *
 * 責務（要件 3.1〜3.4、3.6）:
 * - 認証済みユーザーを Cognito サブジェクト識別子から解決する。
 * - 対象チームを決定する（teamId 指定時はそれを、未指定時は自チームを既定とする。要件 3.3、3.4）。
 * - 選択チームの所属メンバーのみを対象に、Target_Week 7 日分の勤務予定を組み立てる（要件 3.3、3.6）。
 * - 日別 Occupancy_Count を純粋ドメイン関数（OccupancyCalculator）で算出する（要件 3.2）。
 *
 * 集計そのものはドメイン層（computeOccupancyByDate）に委譲し、本サービスは
 * DB からのデータ取得と整形（メンバー × 日付マトリクス）に専念する。
 * 基準日（Target_Week 導出の起点）はサーバー現在日（UTC）とし、ScheduleService と揃える。
 */
@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * チーム週次カレンダーを集約して返す（要件 3.1〜3.4、3.6）。
   *
   * @param cognitoSub 認証済みユーザーの Cognito サブジェクト識別子
   * @param teamIdInput 表示対象チーム ID。未指定時は自チームを既定とする（要件 3.4）。
   * @param weekStartInput 週の起点日（YYYY-MM-DD）。省略時はサーバー現在日から翌週を導出する。
   */
  async getTeamCalendar(
    requesterId: string,
    teamIdInput?: string,
    weekStartInput?: string,
  ): Promise<CalendarResponse> {
    // リクエストユーザーを解決する。DB に存在しないユーザーは操作できない（403）。
    const requester = await this.usersService.findById(requesterId);
    if (!requester) {
      throw new ForbiddenException(
        'このユーザーはシステムに登録されていないため、操作を実行できません。',
      );
    }

    // 対象週を決定する。指定があればそれを基準日に、なければサーバー現在日を基準に翌週を導出する。
    const referenceDate = weekStartInput ?? this.getServerToday();
    const { weekStart, dates } = resolveTargetWeek(referenceDate);

    // 対象チームを決定する。teamId 指定時はそれを優先し、未指定時は自チームを既定とする（要件 3.3、3.4）。
    const targetTeamId = teamIdInput ?? requester.teamId;

    // チーム未指定かつ自身も未所属の場合、対象メンバーが存在しない。
    // メンバー空・Occupancy_Count はすべて 0 のレスポンスを返す（境界挙動）。
    if (!targetTeamId) {
      return {
        weekStart,
        teamId: null,
        members: [],
        occupancyByDate: dates.map((date) => ({ date, officeCount: 0 })),
      };
    }

    // 選択チームの所属メンバーのみを取得する（チームフィルタ。要件 3.3）。
    const members = await this.teamsService.getMembersByTeam(targetTeamId);

    // 対象メンバーの、対象 7 日分の勤務予定を取得する。
    const schedules = await this.loadSchedules(members, dates);

    // メンバーごとに (date -> workLocation) の索引を作り、7 日分を網羅する days[] を構築する。
    const memberViews = this.buildMemberViews(members, schedules, dates);

    // Occupancy_Count は純粋ドメイン関数に委譲して算出する（要件 3.2）。
    const scheduleRecords: ScheduleRecord[] = schedules.map((schedule) => ({
      userId: schedule.userId,
      date: schedule.date,
      workLocation: schedule.workLocation,
    }));
    const occupancyByDate = computeOccupancyByDate(scheduleRecords, dates);

    return {
      weekStart,
      teamId: targetTeamId,
      members: memberViews,
      occupancyByDate,
    };
  }

  /**
   * 対象メンバー集合の、対象日集合に該当する勤務予定を取得する。
   * メンバーが 0 人の場合は DB へ問い合わせず空配列を返す。
   */
  private async loadSchedules(
    members: readonly User[],
    dates: readonly string[],
  ): Promise<Schedule[]> {
    if (members.length === 0) {
      return [];
    }
    const memberIds = members.map((member) => member.id);
    return this.scheduleRepository.find({
      where: {
        userId: In(memberIds),
        date: In(dates as string[]),
      },
    });
  }

  /**
   * メンバー × 日付のマトリクスを構築する。各メンバーは Target_Week 7 日分を
   * 並び順どおりに持ち、登録がない日は null（未登録）とする（要件 3.6）。
   */
  private buildMemberViews(
    members: readonly User[],
    schedules: readonly Schedule[],
    dates: readonly string[],
  ): CalendarMember[] {
    // userId -> (date -> workLocation) の二段マップを作る。
    const byUser = new Map<string, Map<string, Schedule['workLocation']>>();
    for (const schedule of schedules) {
      let dateMap = byUser.get(schedule.userId);
      if (!dateMap) {
        dateMap = new Map();
        byUser.set(schedule.userId, dateMap);
      }
      dateMap.set(schedule.date, schedule.workLocation);
    }

    return members.map((member) => {
      const dateMap = byUser.get(member.id);
      return {
        userId: member.id,
        name: member.name,
        days: dates.map((date) => ({
          date,
          workLocation: dateMap?.get(date) ?? null,
        })),
      };
    });
  }

  /**
   * サーバー現在日を UTC の 'YYYY-MM-DD' 文字列で返す（Target_Week 導出の基準日）。
   * ドメイン層が UTC 固定で計算するため、基準日も UTC で統一する（ScheduleService と整合）。
   */
  private getServerToday(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
