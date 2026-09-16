import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../common/auth/cognito-token-verifier';
import { CalendarService } from './calendar.service';
import { CalendarResponse } from './dto/calendar-response.dto';

/**
 * チーム週次カレンダーの REST エンドポイント（CalendarModule）。
 *
 * グローバルプレフィックス（api）により実際のパスは `/api/calendar` となる。
 * - GET /calendar?teamId=&weekStart=: 指定チーム（未指定時は自チーム）の
 *   週次勤務予定と日別 Occupancy_Count を返す（要件 3.1〜3.4、3.6）。
 *
 * 認可（設計書 API 一覧「要認証（全ロール）」）:
 * - JwtAuthGuard で認証必須とするのみで、ロール制限は設けない（Employee / Administrator 双方が閲覧可）。
 *
 * コントローラは薄く保ち、チーム解決・データ取得・集計はすべて CalendarService に委譲する。
 */
@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  /**
   * GET /calendar?teamId=<uuid>&weekStart=YYYY-MM-DD
   * 週次カレンダーを集約して返す（要件 3.1〜3.4、3.6）。
   * teamId 省略時は自チーム（要件 3.4）、weekStart 省略時はサーバー現在日から翌週を対象とする。
   */
  @Get()
  async getCalendar(
    @Req() request: Request,
    @Query('teamId') teamId?: string,
    @Query('weekStart') weekStart?: string,
  ): Promise<CalendarResponse> {
    const cognitoSub = this.getCognitoSub(request);
    return this.calendarService.getTeamCalendar(cognitoSub, teamId, weekStart);
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
