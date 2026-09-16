import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Schedule } from '../entities/schedule.entity';
import { User } from '../entities/user.entity';
import { ThresholdSetting } from '../entities/threshold-setting.entity';
import { WorkLocation } from '../entities/enums';
import { UsersService } from '../users/users.service';
import { resolveTargetWeek } from '../domain/target-week';
import { computeDailyRates, ScheduleRecord } from '../domain/occupancy';
import { assertThreshold } from '../domain/threshold';
import {
  DashboardAttendee,
  DashboardAttendeesResponse,
  DashboardOccupancyResponse,
  ThresholdResponse,
} from './dto/dashboard-response.dto';

/**
 * しきい値設定が未登録の場合に返す既定値（要件 4.3）。
 *
 * ThresholdSetting はシステム全体で単一レコードとして運用するが、
 * 初期状態（未設定）では行が存在しない。GET /dashboard/threshold が常に
 * 一貫した形状を返せるよう、妥当性ルール（0〜100 の整数かつ upper > lower）を
 * 満たす既定ペアを定義する。フロントの初期表示・分析既定値として利用する。
 */
const DEFAULT_UPPER_THRESHOLD = 70;
const DEFAULT_LOWER_THRESHOLD = 30;

/**
 * ダッシュボード集計としきい値管理を担うサービス（DashboardModule）。
 *
 * 責務（要件 4.1、4.3〜4.7）:
 * - 組織全体（全チーム横断）の日別 Occupancy_Count・出社率・在宅率を算出する（要件 4.1、4.5）。
 * - 指定日に出社（office）を登録した Employee 一覧を返す（要件 4.6、0 人時は空配列。要件 4.7）。
 * - システム全体で単一のしきい値設定を取得・更新する。更新はドメイン層で検証し、
 *   不正時は保存せず既存値を保持する（要件 4.3、4.4）。
 *
 * 集計そのものは純粋ドメイン関数（OccupancyCalculator / ThresholdValidator）へ委譲し、
 * 本サービスは DB からのデータ取得と整形に専念する。基準日（Target_Week 導出の起点）は
 * サーバー現在日（UTC）とし、ScheduleService / CalendarService と揃える。
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ThresholdSetting)
    private readonly thresholdRepository: Repository<ThresholdSetting>,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Target_Week の日別 Occupancy_Count・出社率・在宅率を返す（要件 4.1、4.5）。
   *
   * ダッシュボードは組織全体を対象とするため、チームで絞り込まず全ユーザーの
   * 勤務予定を集計する。日別の算出は純粋関数 computeDailyRates に委譲する。
   *
   * @param weekStartInput 週の起点日（YYYY-MM-DD）。省略時はサーバー現在日から翌週を導出する。
   */
  async getOccupancy(
    weekStartInput?: string,
  ): Promise<DashboardOccupancyResponse> {
    // 対象週を決定する。指定があればそれを基準日に、なければサーバー現在日を基準に翌週を導出する。
    const referenceDate = weekStartInput ?? this.getServerToday();
    const { weekStart, dates } = resolveTargetWeek(referenceDate);

    // 対象 7 日分の勤務予定を全ユーザー分取得する（組織全体の集計）。
    const schedules = await this.scheduleRepository.find({
      where: { date: In(dates as string[]) },
    });

    // 純粋関数へ渡すためのプレーン型へ変換する。
    const records: ScheduleRecord[] = schedules.map((schedule) => ({
      userId: schedule.userId,
      date: schedule.date,
      workLocation: schedule.workLocation,
    }));

    // 各日について Occupancy_Count・出社率・在宅率を算出する（要件 4.1、4.5）。
    const days = dates.map((date) => {
      const rates = computeDailyRates(records, date);
      return {
        date,
        officeCount: rates.officeCount,
        remoteCount: rates.remoteCount,
        total: rates.total,
        officeRate: rates.officeRate,
        remoteRate: rates.remoteRate,
      };
    });

    return { weekStart, days };
  }

  /**
   * 指定日に出社（office）を登録した Employee 一覧を返す（要件 4.6、4.7）。
   * 対象者が 0 人の場合は空配列を返す（要件 4.7、フロントで未在席メッセージを表示）。
   *
   * @param date 対象日（YYYY-MM-DD、形式は DTO/コントローラで検証済み）
   */
  async getAttendees(date: string): Promise<DashboardAttendeesResponse> {
    // 当日 office を登録した勤務予定を、ユーザー情報とともに取得する。
    const schedules = await this.scheduleRepository.find({
      where: { date, workLocation: WorkLocation.Office },
      relations: { user: true },
      order: { user: { name: 'ASC' } },
    });

    const attendees: DashboardAttendee[] = schedules
      // リレーション未解決（ユーザー削除済みなど）の防御。通常は user が存在する。
      .filter((schedule) => schedule.user)
      .map((schedule) => ({
        userId: schedule.user.id,
        name: schedule.user.name,
        email: schedule.user.email,
      }));

    return { date, attendees };
  }

  /**
   * 現在のしきい値設定を返す（要件 4.3）。
   * システム全体で単一レコード運用のため、最初の 1 件を読み込む。
   * 未設定（行が存在しない）の場合は既定値を返す。
   */
  async getThreshold(): Promise<ThresholdResponse> {
    const current = await this.loadCurrentSetting();
    if (!current) {
      return {
        upperThreshold: DEFAULT_UPPER_THRESHOLD,
        lowerThreshold: DEFAULT_LOWER_THRESHOLD,
      };
    }
    return {
      upperThreshold: current.upperThreshold,
      lowerThreshold: current.lowerThreshold,
    };
  }

  /**
   * しきい値設定を更新する（要件 4.3、4.4）。
   *
   * 検証はドメイン層（assertThreshold）へ委譲し、不正な場合は 400 で拒否したうえで
   * 既存のしきい値設定を一切変更しない（要件 4.4）。妥当な場合のみ、単一レコードを
   * upsert し、更新者（Administrator の User.id）を記録する。
   *
   * @param cognitoSub 認証済み Administrator の Cognito サブジェクト識別子
   * @param upper 出社上限しきい値
   * @param lower 出社下限しきい値
   */
  async updateThreshold(
    cognitoSub: string,
    upper: number,
    lower: number,
  ): Promise<ThresholdResponse> {
    // 妥当性検証（0〜100 の整数かつ upper > lower）。不正時は保存せず 400 を返す（要件 4.4）。
    try {
      assertThreshold(upper, lower);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'しきい値が不正です。';
      throw new BadRequestException(message);
    }

    // 更新者（Administrator）を DB ユーザーとして解決する。未同期ユーザーは操作不可（403）。
    const admin = await this.usersService.findByCognitoSub(cognitoSub);
    if (!admin) {
      throw new ForbiddenException(
        'このユーザーはシステムに登録されていないため、操作を実行できません。',
      );
    }

    // 単一レコード運用のため、既存があれば更新、なければ新規作成する。
    const current = await this.loadCurrentSetting();
    const entity = current ?? this.thresholdRepository.create();
    entity.upperThreshold = upper;
    entity.lowerThreshold = lower;
    entity.updatedBy = admin.id;

    const saved = await this.thresholdRepository.save(entity);
    return {
      upperThreshold: saved.upperThreshold,
      lowerThreshold: saved.lowerThreshold,
    };
  }

  /**
   * システム全体で単一運用のしきい値設定レコードを読み込む。
   * 複数行が存在しても常に同一の 1 件を選ぶよう、id 昇順で先頭を採用する。
   */
  private async loadCurrentSetting(): Promise<ThresholdSetting | null> {
    return this.thresholdRepository.findOne({
      where: {},
      order: { id: 'ASC' },
    });
  }

  /**
   * サーバー現在日を UTC の 'YYYY-MM-DD' 文字列で返す（Target_Week 導出の基準日）。
   * ドメイン層が UTC 固定で計算するため、基準日も UTC で統一する。
   */
  private getServerToday(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
