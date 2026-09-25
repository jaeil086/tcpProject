import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from '../entities/schedule.entity';
import { WorkLocation } from '../entities/enums';
import { UsersService } from '../users/users.service';
import {
  isWithinTargetWeek,
  resolveTargetWeek,
} from '../domain/target-week';
import { assertWorkLocation } from '../domain/work-location';
import {
  ScheduleDayEntry,
  UpsertScheduleResponse,
  WeekScheduleResponse,
} from './dto/schedule-response.dto';

/**
 * 勤務予定の登録・更新・照会を担うサービス（Schedule_Service）。
 *
 * 責務（要件 2.1〜2.7）:
 * - Cognito のサブジェクト識別子から DB ユーザー（内部 userId）を解決する。
 * - Target_Week（翌週の月〜日）範囲外・不正な勤務区分を拒否し、既存データを変更しない。
 * - 「ユーザー × 日付」で一意な upsert を行い、同一日は 1 件のみ保持する（要件 2.7）。
 * - Target_Week 7 日分を登録済み／未登録（null）を区別して返す（要件 2.6）。
 *
 * 基準日（Target_Week 導出の起点）はサーバー現在日（UTC の YYYY-MM-DD）とする。
 * ドメイン層（target-week.ts）が UTC 固定で日付計算するため、基準日も UTC で揃える。
 */
@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    private readonly usersService: UsersService,
  ) {}

  /**
   * 認証済みユーザーの勤務予定を upsert する（要件 2.1、2.4、2.7）。
   *
   * 検証順序（いずれも違反時は既存データを変更しない）:
   *   1. 勤務区分の妥当性（assertWorkLocation。要件 2.3）
   *   2. Target_Week 範囲内か（isWithinTargetWeek。要件 2.5）
   * その後、複合一意制約 (user_id, date) に基づく upsert を実行する。
   *
   * @param cognitoSub 認証済みユーザーの Cognito サブジェクト識別子
   * @param date 対象日（YYYY-MM-DD、形式は DTO で検証済み）
   * @param workLocationInput 勤務区分の入力値（未検証の文字列）
   */
  async upsertMySchedule(
    cognitoSub: string,
    date: string,
    workLocationInput: string,
  ): Promise<UpsertScheduleResponse> {
    const userId = await this.resolveUserId(cognitoSub);

    // 勤務区分の妥当性検証（不正値は 400 で拒否。要件 2.3）
    const workLocation = this.validateWorkLocation(workLocationInput);

    // Target_Week（翌週の月〜日）範囲内かを検証（範囲外は 400 で拒否。要件 2.5）
    const referenceDate = this.getServerToday();
    if (!isWithinTargetWeek(date, referenceDate)) {
      const { weekStart, dates } = resolveTargetWeek(referenceDate);
      const weekEnd = dates[dates.length - 1];
      throw new BadRequestException(
        `勤務予定は対象週（翌週の月曜 ${weekStart} 〜 日曜 ${weekEnd}）の範囲内で指定してください。`,
      );
    }

    // 複合一意制約 (user_id, date) に基づく upsert（要件 2.1、2.4、2.7）。
    // 競合時は work_location を新しい値へ更新する。
    await this.scheduleRepository.upsert(
      { userId, date, workLocation },
      { conflictPaths: ['userId', 'date'] },
    );

    return { success: true, date, workLocation };
  }

  /**
   * 認証済みユーザーの Target_Week 7 日分の勤務予定を返す（要件 2.6）。
   *
   * weekStart を指定した場合はその週を、省略時はサーバー現在日から導出した
   * Target_Week を対象とする。各日について登録済みの勤務区分、または未登録（null）を返す。
   *
   * @param cognitoSub 認証済みユーザーの Cognito サブジェクト識別子
   * @param weekStartInput 任意の起点日（YYYY-MM-DD）。省略時は翌週の月曜を用いる。
   */
  async getMyWeekSchedule(
    cognitoSub: string,
    weekStartInput?: string,
  ): Promise<WeekScheduleResponse> {
    const userId = await this.resolveUserId(cognitoSub);

    // 起点日が指定されればそれを基準に、なければサーバー現在日を基準に 7 日分を導出する。
    const referenceDate = weekStartInput ?? this.getServerToday();
    const { weekStart, dates } = resolveTargetWeek(referenceDate);

    // 対象 7 日分のうち登録済みのものだけを取得する。
    const schedules = await this.scheduleRepository.find({
      where: { userId },
    });

    // 日付 -> 勤務区分のマップを作り、7 日分を「登録済み／未登録」で埋める。
    const workLocationByDate = new Map<string, WorkLocation>();
    for (const schedule of schedules) {
      if (dates.includes(schedule.date)) {
        workLocationByDate.set(schedule.date, schedule.workLocation);
      }
    }

    const days: ScheduleDayEntry[] = dates.map((date) => ({
      date,
      workLocation: workLocationByDate.get(date) ?? null,
    }));

    return { weekStart, days };
  }

  /**
   * 勤務区分入力値を検証し、妥当なら WorkLocation を返す。
   * 不正な場合はドメイン層のエラーメッセージ（許容値を含む）を 400 に変換する（要件 2.3）。
   */
  private validateWorkLocation(value: string): WorkLocation {
    try {
      return assertWorkLocation(value);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '勤務区分の値が不正です。';
      throw new BadRequestException(message);
    }
  }

  /**
   * トークン由来のユーザー id から DB ユーザーの内部 ID（UUID）を解決する。
   * DB に該当ユーザーが存在しない場合（削除済み等）は「me」操作を許可できないため、
   * 403（Forbidden）として拒否する。
   */
  private async resolveUserId(requesterId: string): Promise<string> {
    const user = await this.usersService.findById(requesterId);
    if (!user) {
      throw new ForbiddenException(
        'このユーザーはシステムに登録されていないため、操作を実行できません。',
      );
    }
    return user.id;
  }

  /**
   * サーバー現在日を UTC の 'YYYY-MM-DD' 文字列で返す（Target_Week 導出の基準日）。
   * ドメイン層が UTC 固定で計算するため、基準日も UTC で統一する。
   */
  private getServerToday(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
