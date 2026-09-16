import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Team } from '../entities/team.entity';
import { TeamsService } from './teams.service';

/**
 * チーム関連の REST エンドポイント。
 *
 * グローバルプレフィックス（api）により実際のパスは `/api/teams` となる。
 * JwtAuthGuard により認証済みユーザー（全ロール）のみアクセスを許可する
 * （設計書 API 一覧: GET /teams は要認証・全ロール）。
 */
@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  /**
   * GET /teams
   * チーム一覧を返す（カレンダーのチーム選択用。要件 3.3）。
   */
  @Get()
  async listTeams(): Promise<Team[]> {
    return this.teamsService.listTeams();
  }
}
