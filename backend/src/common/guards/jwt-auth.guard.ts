import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  AuthenticatedUser,
  JwtTokenService,
} from '../auth/jwt-token.service';

/**
 * 自己発行 JWT を検証する認証ガード。
 *
 * - Authorization ヘッダーから Bearer トークンを抽出する。トークンが欠如／形式不正の場合は
 *   401（UnauthorizedException）を送出する。フロントエンドはこれを受けて元アクセス先を保持し
 *   ログイン画面へリダイレクトする（要件 1.1、1.6）。
 * - JwtTokenService でサーバー秘密鍵（JWT_SECRET）による署名・有効期限を検証する。
 *   期限切れ・改ざん時も 401 とする。
 * - トークンにはログイン時に DB から確定したロールと、ユーザー id（sub）が含まれる。
 *   これらを信頼し、検証済みユーザー情報を `request.user`（{ sub, email, role, userId }）に
 *   付与する。RolesGuard など後続はこれを参照する。
 * - `@Public()` が付与されたルートは検証をスキップする。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 公開ルートは認証不要
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('認証トークンが指定されていません。');
    }

    try {
      const user: AuthenticatedUser = await this.jwtTokenService.verify(token);

      // 後続のガード・コントローラから参照できるように付与する
      (request as Request & { user?: AuthenticatedUser }).user = user;
      return true;
    } catch (error) {
      this.logger.warn(
        `JWT 検証に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('認証トークンが無効または期限切れです。');
    }
  }

  /**
   * Authorization ヘッダーから Bearer トークンを取り出す。
   * `Authorization: Bearer <token>` 形式でない場合は null を返す。
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
