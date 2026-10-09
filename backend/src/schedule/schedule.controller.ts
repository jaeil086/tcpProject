import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../common/auth/jwt-token.service';
import { ScheduleService } from './schedule.service';
import { UpsertScheduleDto } from './dto/upsert-schedule.dto';
import {
  UpsertScheduleResponse,
  WeekScheduleResponse,
} from './dto/schedule-response.dto';

/**
 * 勤務予定の REST エンドポイント（Schedule_Service）。
 *
 * グローバルプレフィックス（api）により実際のパスは `/api/schedules/*` となる。
 * - PUT /schedules/me: 自身の特定日の勤務予定を upsert する（要件 2.1、2.4）。
 * - GET /schedules/me: 自身の Target_Week 平日 5 日分を返す（要件 2.6）。
 *
 * 認可:
 * - JwtAuthGuard で認証必須とする（ロール制限は設けない）。
 *   勤務予定の登録・照会は「自分自身（me）」のデータのみを対象とするため、
 *   管理者・従業員のいずれのロールでも自分の勤務予定を登録・照会できる。
 *   （管理者も一従業員として出社／在宅を登録できるようにするための方針。
 *     全体管理機能であるダッシュボード・AI 分析・ユーザー管理は引き続き管理者専用。）
 * - 対象ユーザーは常にトークンの sub（request.user.sub）で決まる「me」セマンティクスとし、
 *   他ユーザーの予定は操作できない。DB ユーザーへの解決はサービス層で行う。
 *
 * コントローラは薄く保ち、検証・永続化・sub→userId 解決はすべて ScheduleService に委譲する。
 */
@Controller('schedules')
@UseGuards(JwtAuthGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  /**
   * PUT /schedules/me
   * 認証済みユーザーの特定日の勤務予定を登録／更新（upsert）する（要件 2.1、2.4）。
   * 範囲外の日付・不正な勤務区分はサービス層が 400 で拒否し、既存データを変更しない
   * （要件 2.3、2.5）。
   */
  @Put('me')
  async upsertMySchedule(
    @Req() request: Request,
    @Body() dto: UpsertScheduleDto,
  ): Promise<UpsertScheduleResponse> {
    const cognitoSub = this.getCognitoSub(request);
    return this.scheduleService.upsertMySchedule(
      cognitoSub,
      dto.date,
      dto.workLocation,
    );
  }

  /**
   * GET /schedules/me?weekStart=YYYY-MM-DD
   * 認証済みユーザーの Target_Week 平日 5 日分を返す（要件 2.6）。
   * weekStart 省略時はサーバー現在日から導出した翌週を対象とする。
   */
  @Get('me')
  async getMyWeekSchedule(
    @Req() request: Request,
    @Query('weekStart') weekStart?: string,
  ): Promise<WeekScheduleResponse> {
    const cognitoSub = this.getCognitoSub(request);
    return this.scheduleService.getMyWeekSchedule(cognitoSub, weekStart);
  }

  /**
   * JwtAuthGuard が付与した認証情報からユーザー識別子（sub）を取り出す。
   * ガードを通過している前提のため通常は存在するが、防御的に空文字を許容する。
   */
  private getCognitoSub(request: Request): string {
    const authUser = (request as Request & { user?: AuthenticatedUser }).user;
    return authUser?.sub ?? '';
  }
}
