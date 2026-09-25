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

/**
 * 管理者専用のユーザー管理 REST エンドポイント（UsersModule がホストする）。
 *
 * グローバルプレフィックス（api）により実際のパスは `/api/users/*` となる。
 * - GET /users            : 全ユーザーの一覧（AdminUserView の配列）
 * - PUT /users/:id/team   : 所属チームの割り当て／解除
 * - PUT /users/:id/role   : ロールの変更
 *
 * 認可:
 * - JwtAuthGuard で認証必須とし、RolesGuard + @Roles(Administrator) により
 *   Administrator 以外のアクセスを 403 で拒否する。
 *
 * コントローラは薄く保ち、検証・永続化はすべて UsersService に委譲する。
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Administrator)
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
   * 指定ユーザーのロールを変更する。
   *
   * 安全策: 管理者が自分自身を employee に降格することは禁止する
   * （最後の管理者を失って管理機能へアクセスできなくなる事故を防ぐ）。
   */
  @Put(':id/role')
  async updateRole(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<AdminUserView> {
    const currentUserId = this.getUserId(request);
    if (
      currentUserId === id &&
      dto.role === UserRole.Employee
    ) {
      throw new BadRequestException(
        '自分自身のロールを従業員に変更することはできません。',
      );
    }
    return this.usersService.updateRole(id, dto.role);
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
