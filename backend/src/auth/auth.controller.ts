import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/auth/jwt-token.service';
import { UsersService, UserProfile } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginResponse } from './dto/login-response.dto';

/**
 * 認証関連の REST エンドポイント。
 *
 * グローバルプレフィックス（api）により実際のパスは `/api/auth/*` となる。
 * - POST /auth/register: 認証不要（@Public）。新規ユーザーを登録する。
 * - POST /auth/login: 認証不要（@Public）。bcrypt 照合後に自己発行 JWT を返す。
 * - POST /auth/logout: 要認証。ステートレス JWT のため no-op（成功応答のみ）。
 * - GET /auth/me: 要認証。ログイン中ユーザーのプロフィールを返す。
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * POST /auth/register
   * メールアドレス・パスワード・氏名で新規登録する（誰でも可）。
   * ロールは employee、所属チームは null で作成される。メール重複は 409 で拒否される。
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<UserProfile> {
    return this.authService.register(dto.email, dto.password, dto.name);
  }

  /**
   * POST /auth/login
   * メールアドレス／パスワードで認証し、自己発行 JWT を返す。
   * 認証失敗は AuthService で 401 として例外化される。
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  /**
   * POST /auth/logout
   * ステートレス JWT のためサーバー側の失効処理は行わない（no-op）。
   * クライアントはトークンを破棄することでログアウトが成立するため、常に成功を返す。
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(): Promise<{ success: boolean }> {
    await this.authService.logout();
    return { success: true };
  }

  /**
   * GET /auth/me
   * ログイン中ユーザーのプロフィール（ロール・所属チーム含む）を返す。
   *
   * JwtAuthGuard が付与した request.user.userId（= ユーザー id）で DB ユーザーを解決する。
   * 解決できない場合（削除済み等）は 404 を返す。
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() request: Request): Promise<UserProfile> {
    const authUser = (request as Request & { user?: AuthenticatedUser }).user;
    const userId = authUser?.userId ?? '';

    const dbUser = await this.usersService.findById(userId);
    if (!dbUser) {
      throw new NotFoundException('ユーザーが見つかりません。');
    }
    return this.usersService.getProfile(dbUser);
  }
}
