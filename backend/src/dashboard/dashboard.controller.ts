import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/auth/cognito-token-verifier';
import { UserRole } from '../entities/enums';
import { DashboardService } from './dashboard.service';
import { UpdateThresholdDto } from './dto/update-threshold.dto';
import {
  DashboardAttendeesResponse,
  DashboardOccupancyResponse,
  ThresholdResponse,
} from './dto/dashboard-response.dto';

/** 'YYYY-MM-DD' 形式の妥当性を検証する正規表現（date クエリの形式チェック用）。 */
const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 管理者ダッシュボードの REST エンドポイント（DashboardModule）。
 *
 * グローバルプレフィックス（api）により実際のパスは `/api/dashboard/*` となる。
 * - GET  /dashboard/occupancy?weekStart=: 組織全体の日別 Occupancy_Count・出社率・在宅率（要件 4.1、4.5）
 * - GET  /dashboard/attendees?date=: 指定日の出社者一覧（要件 4.6、4.7）
 * - GET  /dashboard/threshold: 現在のしきい値設定（要件 4.3）
 * - PUT  /dashboard/threshold: しきい値設定の更新（要件 4.3、4.4）
 *
 * 認可（設計書 API 一覧「要認証（Administrator）」、要件 4.2）:
 * - JwtAuthGuard で認証必須とし、RolesGuard + @Roles(Administrator) により
 *   Administrator 以外のアクセスを 403 で拒否する。
 *
 * コントローラは薄く保ち、集計・検証・永続化はすべて DashboardService に委譲する。
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Administrator)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /dashboard/occupancy?weekStart=YYYY-MM-DD
   * Target_Week の日別 Occupancy_Count・出社率・在宅率を返す（要件 4.1、4.5）。
   * weekStart 省略時はサーバー現在日から翌週を対象とする。
   */
  @Get('occupancy')
  async getOccupancy(
    @Query('weekStart') weekStart?: string,
  ): Promise<DashboardOccupancyResponse> {
    return this.dashboardService.getOccupancy(weekStart);
  }

  /**
   * GET /dashboard/attendees?date=YYYY-MM-DD
   * 指定日に出社を登録した Employee の一覧を返す（要件 4.6）。
   * 出社者が 0 人の場合は空配列を返す（要件 4.7）。date は必須。
   */
  @Get('attendees')
  async getAttendees(
    @Query('date') date?: string,
  ): Promise<DashboardAttendeesResponse> {
    if (!date || !DATE_STRING_PATTERN.test(date)) {
      throw new BadRequestException(
        "date は 'YYYY-MM-DD' 形式で指定してください。",
      );
    }
    return this.dashboardService.getAttendees(date);
  }

  /**
   * GET /dashboard/threshold
   * 現在の Upper/Lower しきい値設定を返す（要件 4.3）。未設定時は既定値を返す。
   */
  @Get('threshold')
  async getThreshold(): Promise<ThresholdResponse> {
    return this.dashboardService.getThreshold();
  }

  /**
   * PUT /dashboard/threshold
   * しきい値を設定する（要件 4.3、4.4）。0〜100 かつ upper > lower を満たさない場合は
   * 保存せず 400 を返し、既存値を保持する。
   */
  @Put('threshold')
  async updateThreshold(
    @Req() request: Request,
    @Body() dto: UpdateThresholdDto,
  ): Promise<ThresholdResponse> {
    const cognitoSub = this.getCognitoSub(request);
    return this.dashboardService.updateThreshold(
      cognitoSub,
      dto.upperThreshold,
      dto.lowerThreshold,
    );
  }

  /**
   * JwtAuthGuard が付与した認証情報から Cognito サブジェクト識別子（sub）を取り出す。
   * ガードを通過している前提のため通常は存在するが、防御的に空文字を許容する。
   */
  private getCognitoSub(request: Request): string {
    const authUser = (request as Request & { user?: AuthenticatedUser }).user;
    return authUser?.sub ?? '';
  }
}
