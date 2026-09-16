import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/auth/cognito-token-verifier';
import { UsersService, UserProfile } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponse } from './dto/login-response.dto';

/**
 * 認証関連の REST エンドポイント。
 *
 * グローバルプレフィックス（api）により実際のパスは `/api/auth/*` となる。
 * - POST /auth/login: 認証不要（@Public）。Cognito 認証を行い JWT を返す（要件 1.2〜1.5）。
 * - POST /auth/logout: 要認証。トークンを無効化する（要件 1.7）。
 * - GET /auth/me: 要認証。ログイン中ユーザーのプロフィールを返す。
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * POST /auth/login
   * メールアドレス／パスワードで Cognito 認証を行い、トークンを返す（要件 1.2）。
   * 失敗（401）・ロックアウト（423）・認証基盤障害（503）は AuthService で例外化される。
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  /**
   * POST /auth/logout
   * 認証済みユーザーのトークンを無効化する（要件 1.7）。
   * Authorization ヘッダーのアクセストークンを Cognito の GlobalSignOut に渡す。
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: Request): Promise<{ success: boolean }> {
    const accessToken = this.extractBearerToken(request);
    if (accessToken) {
      await this.authService.logout(accessToken);
    }
    // クライアントはトークンを破棄するため、常に成功として応答する。
    return { success: true };
  }

  /**
   * GET /auth/me
   * ログイン中ユーザーのプロフィール（ロール・所属チーム含む）を返す。
   *
   * JwtAuthGuard が検証済みクレームを request.user に付与するため、その sub から
   * DB ユーザーを解決してプロフィールを組み立てる。DB に該当ユーザーが存在しない場合は、
   * トークンのクレームから最小限のプロフィールを返す（Cognito 上は有効だが未同期の状態）。
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() request: Request): Promise<UserProfile> {
    const authUser = (request as Request & { user?: AuthenticatedUser }).user;
    const cognitoSub = authUser?.sub ?? '';

    const dbUser = await this.usersService.findByCognitoSub(cognitoSub);
    if (dbUser) {
      return this.usersService.getProfile(dbUser);
    }

    // DB 未同期時はクレームベースの最小プロフィールを返す。
    return this.buildProfileFromClaims(authUser);
  }

  /**
   * DB ユーザーが未解決のとき、トークンクレームから最小限のプロフィールを組み立てる。
   * ロールはクレームから解決できた文字列をそのまま用い、所属チームは未解決（null）とする。
   */
  private buildProfileFromClaims(
    authUser: AuthenticatedUser | undefined,
  ): UserProfile {
    return {
      id: '',
      cognitoSub: authUser?.sub ?? '',
      email: authUser?.email ?? '',
      name: '',
      // クレーム由来のロール文字列（UserRole と一致しない可能性があるため as で受ける）
      role: authUser?.role as UserProfile['role'],
      teamId: null,
      teamName: null,
    };
  }

  /**
   * Authorization ヘッダーから Bearer トークンを取り出す。
   * JwtAuthGuard を通過している前提のため通常は存在するが、防御的に null を許容する。
   */
  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) {
      return null;
    }
    return value.trim() || null;
  }
}
