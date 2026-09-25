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
  CognitoTokenVerifier,
} from '../auth/cognito-token-verifier';
import { UsersService } from '../../users/users.service';

/**
 * Cognito が発行した JWT を検証する認証ガード。
 *
 * - Authorization ヘッダーから Bearer トークンを抽出する。トークンが欠如／形式不正の場合は
 *   401（UnauthorizedException）を送出する。フロントエンドはこれを受けて元アクセス先を保持し
 *   ログイン画面へリダイレクトする（要件 1.1、1.6）。
 * - CognitoTokenVerifier で署名・有効期限などを検証する。期限切れ・改ざん時も 401 とする。
 * - 検証成功後、cognito_sub でアプリ DB のユーザーを解決し、ロール（role）を
 *   DB 上の値で確定する。これにより、Cognito のグループやカスタム属性に依存せず、
 *   DB（シード）で管理したロールに基づいて認可判定（RolesGuard）を行える。
 *   DB にユーザーが存在しない場合は、トークンクレーム由来のロールをそのまま用いる（防御的）。
 * - 検証成功時は認証済みユーザー情報を `request.user` に付与し、RolesGuard など後続で参照する。
 * - `@Public()` が付与されたルートは検証をスキップする。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokenVerifier: CognitoTokenVerifier,
    private readonly usersService: UsersService,
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
      const user: AuthenticatedUser = await this.tokenVerifier.verify(token);

      // cognito_sub でアプリ DB のユーザーを解決し、ロールを DB の値で確定する。
      // これにより Cognito のグループ／カスタム属性に依存せず、シードした role で
      // 認可判定できる。DB に未登録の場合はトークン由来のロールを維持する。
      try {
        const dbUser = await this.usersService.findByCognitoSub(user.sub);
        if (dbUser) {
          user.role = dbUser.role;
        }
      } catch (lookupError) {
        // DB 参照に失敗しても認証自体は成立させる（ロールはトークン由来のまま）。
        this.logger.warn(
          `ユーザーのロール解決に失敗しました（トークン由来のロールを使用）: ${
            lookupError instanceof Error ? lookupError.message : String(lookupError)
          }`,
        );
      }

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
