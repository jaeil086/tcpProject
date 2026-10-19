import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../common/auth/jwt-token.service';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../entities/enums';
import { CreateTeamDto } from './dto/create-team.dto';
import { SetLeaderDto } from './dto/set-leader.dto';
import { TeamsService, TeamSummary } from './teams.service';

/**
 * チーム関連の REST エンドポイント。
 *
 * グローバルプレフィックス（api）により実際のパスは `/api/teams` となる。
 * - GET  /teams            : チーム一覧（リーダー情報付き）。認証済みユーザー（全ロール）が利用可。
 * - POST /teams            : チーム新規作成（最上位管理者のみ。作成者をリーダーとして記録）。
 * - DELETE /teams/:id       : チーム削除（最上位管理者のみ）。
 * - PUT /teams/:id/leader  : チームリーダーの設定・解除（最上位管理者のみ）。
 *
 * 認可方針:
 * - クラスレベルでは JwtAuthGuard のみを適用し、認証必須とする。
 * - チームの作成（POST）／削除（DELETE）／リーダー設定（PUT /:id/leader）は
 *   最上位管理者（SuperAdmin）のみに限定し、RolesGuard + @Roles(SuperAdmin) を付与する。
 * - GET は @Roles 指定がないため全ロールで利用できる
 *   （RolesGuard はロール指定のないルートを常に許可する）。
 */
@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  /**
   * GET /teams
   * チーム一覧をリーダー情報付きで返す（カレンダーのチーム選択用。要件 3.3）。
   */
  @Get()
  async listTeams(): Promise<TeamSummary[]> {
    return this.teamsService.listTeams();
  }

  /**
   * POST /teams
   * チームを新規作成する（最上位管理者のみ）。作成した管理者をリーダーとして記録する。
   * 作成されたチーム（リーダー情報付き）を 201 で返す。
   */
  @Post()
  @HttpCode(201)
  @UseGuards(RolesGuard)
  @Roles(UserRole.SuperAdmin)
  async createTeam(
    @Req() request: Request,
    @Body() dto: CreateTeamDto,
  ): Promise<TeamSummary> {
    const userId = this.getUserId(request);
    return this.teamsService.createTeam(dto.name, userId);
  }

  /**
   * DELETE /teams/:id
   * チームを削除する（最上位管理者のみ）。
   * 所属メンバーがいる場合は未所属（team_id = NULL）へ退避してから削除する。
   * 成功時は 204 No Content を返す。
   */
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles(UserRole.SuperAdmin)
  async deleteTeam(@Param('id') id: string): Promise<void> {
    await this.teamsService.deleteTeam(id);
  }

  /**
   * PUT /teams/:id/leader
   * チームリーダーを設定・解除する（最上位管理者のみ）。
   * leaderId に team_admin かつ当該チーム所属のユーザーを指定するとリーダーに設定し、
   * null を指定すると解除する。更新後のチーム（リーダー情報付き）を返す。
   */
  @Put(':id/leader')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SuperAdmin)
  async setLeader(
    @Param('id') id: string,
    @Body() dto: SetLeaderDto,
  ): Promise<TeamSummary> {
    return this.teamsService.setLeader(id, dto.leaderId ?? null);
  }

  /**
   * JwtAuthGuard が付与した認証情報からアプリユーザーの id を取り出す。
   * ガードを通過している前提のため通常は存在するが、防御的に空文字を許容する。
   */
  private getUserId(request: Request): string {
    const authUser = (request as Request & { user?: AuthenticatedUser }).user;
    return authUser?.userId ?? '';
  }
}
