import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/auth/jwt-token.service';
import { UserRole } from '../entities/enums';
import { AdminUserView, UsersService } from './users.service';
import { AssignTeamDto } from './dto/assign-team.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ResetPasswordResponseDto } from './dto/reset-password-response.dto';

/**
 * 管理者専用のユーザー管理 REST エンドポイント（UsersModule がホストする）。
 *
 * グローバルプレフィックス（api）により実際のパスは `/api/users/*` となる。
 * - GET /users             : 全ユーザーの一覧（AdminUserView の配列）
 * - PUT /users/:id/team    : 所属チームの割り当て／解除
 * - PUT /users/:id/role    : ロールの変更（最上位管理者のみ）
 * - PUT /users/:id/password: パスワードの一時パスワードへの再設定（最上位管理者のみ）
 *
 * 認可（3 階層の権限体系）:
 * - クラスレベルで JwtAuthGuard + RolesGuard + @Roles(SuperAdmin, TeamAdmin) を適用し、
 *   最上位管理者・チーム管理者のみ利用可とする。従業員は 403 で拒否する。
 * - ユーザー一覧（GET /users）とチーム割り当て（PUT /users/:id/team）は両管理者が利用できる
 *   （チーム管理者はメンバーをチームへ割り当て可能、要件に準拠）。
 * - ロール変更（PUT /users/:id/role）はメソッドレベルで @Roles(SuperAdmin) に絞り、
 *   最上位管理者のみ許可する。
 *
 * コントローラは薄く保ち、検証・永続化はすべて UsersService に委譲する。
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SuperAdmin, UserRole.TeamAdmin)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users
   * 全ユーザーを管理者向けビュー（パスワードハッシュを含まない）で返す。
   */
  @Get()
  async listUsers(): Promise<AdminUserView[]> {
    return this.usersService.listUsers();
  }

  /**
   * PUT /users/:id/team
   * 指定ユーザーの所属チームを割り当て／解除する。
   * teamId が null なら未所属化し、null 以外なら該当チームの存在を検証する。
   */
  @Put(':id/team')
  async assignTeam(
    @Param('id') id: string,
    @Body() dto: AssignTeamDto,
  ): Promise<AdminUserView> {
    return this.usersService.assignTeam(id, dto.teamId);
  }

  /**
   * PUT /users/:id/role
   * 指定ユーザーのロールを変更する（最上位管理者のみ）。
   *
   * 安全策: 最上位管理者が自分自身を最上位管理者以外へ降格することは禁止する
   * （最後の最上位管理者を失い、管理機能へアクセスできなくなる事故を防ぐ）。
   */
  @Put(':id/role')
  @Roles(UserRole.SuperAdmin)
  async updateRole(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<AdminUserView> {
    const currentUserId = this.getUserId(request);
    if (currentUserId === id && dto.role !== UserRole.SuperAdmin) {
      throw new BadRequestException(
        '自分自身のロールを最上位管理者以外に変更することはできません。',
      );
    }
    return this.usersService.updateRole(id, dto.role);
  }

  /**
   * PUT /users/:id/password
   * 指定ユーザーのパスワードを一時パスワードへ再設定する（最上位管理者のみ）。
   *
   * サーバーが強度を満たす一時パスワードを自動生成し、ハッシュ化して保存する。
   * 生成した平文の一時パスワードはこの応答でのみ 1 回返す（管理者が対象ユーザーへ伝達する用途）。
   */
  @Put(':id/password')
  @Roles(UserRole.SuperAdmin)
  async resetPassword(
    @Param('id') id: string,
  ): Promise<ResetPasswordResponseDto> {
    return this.usersService.resetPassword(id);
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
