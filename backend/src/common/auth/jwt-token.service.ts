import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

/**
 * JWT 検証後にリクエストへ受け渡す認証済みユーザー情報。
 *
 * 本アプリは自前で JWT を発行・検証する。トークンには DB ユーザーの id を sub として格納し、
 * 認可判定に用いるロール（role）もログイン時に DB から確定した値を埋め込む。
 * userId は sub と同一（アプリユーザーの id）で、参照の明確化のため別名で保持する。
 */
export interface AuthenticatedUser {
  /** サブジェクト（= アプリユーザーの id） */
  sub: string;
  /** メールアドレス（トークンに含まれる場合） */
  email?: string;
  /** ロール（ログイン時に DB から確定した値） */
  role?: string;
  /** アプリユーザーの id（sub と同値。参照明確化のため保持） */
  userId: string;
}

/**
 * 自己発行 JWT のペイロード（署名・検証で扱うクレーム）。
 */
export interface JwtPayload {
  /** サブジェクト（アプリユーザーの id） */
  sub: string;
  /** メールアドレス */
  email: string;
  /** ロール */
  role: string;
}

/** 発行したトークンの情報（AuthService がレスポンス組み立てに利用する）。 */
export interface IssuedToken {
  /** アクセストークン（JWT） */
  accessToken: string;
  /** トークン種別（常に "Bearer"） */
  tokenType: 'Bearer';
  /** 有効期限（秒） */
  expiresIn: number;
}

/** 開発用のフォールバック秘密鍵（本番では必ず JWT_SECRET を設定すること）。 */
const DEV_FALLBACK_SECRET = 'dev-only-insecure-jwt-secret-change-me';
/** 既定の有効期限（秒）。JWT_EXPIRES_IN 未設定時に用いる（12 時間）。 */
const DEFAULT_EXPIRES_IN_SECONDS = 12 * 60 * 60;

/**
 * 自己発行 JWT の署名・検証を担うサービス。
 *
 * - サーバー秘密鍵（環境変数 JWT_SECRET）で HS256 署名する。
 *   JWT_SECRET が未設定の場合は開発用フォールバックを用い、本番設定を促す警告を出す。
 * - 有効期限は JWT_EXPIRES_IN（秒）で調整可能。未設定時は 12 時間。
 * - 検証成功時は AuthenticatedUser を返し、失敗時（署名不正・期限切れ等）は例外を送出する。
 *
 * @nestjs/jwt の JwtService を内部で利用する。テストでは本サービスをモックへ差し替え可能。
 */
@Injectable()
export class JwtTokenService {
  private readonly logger = new Logger(JwtTokenService.name);
  private readonly secret: string;
  private readonly expiresInSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const configuredSecret = this.configService.get<string>('JWT_SECRET');
    if (configuredSecret && configuredSecret.length > 0) {
      this.secret = configuredSecret;
    } else {
      // 秘密鍵未設定は本番では重大な問題のため、警告を出しつつ開発用鍵で継続する。
      this.logger.warn(
        'JWT_SECRET が未設定です。開発用のフォールバック秘密鍵を使用します。本番環境では必ず JWT_SECRET を設定してください。',
      );
      this.secret = DEV_FALLBACK_SECRET;
    }

    const configuredExpires = this.configService.get<string>('JWT_EXPIRES_IN');
    const parsed = configuredExpires ? Number(configuredExpires) : NaN;
    this.expiresInSeconds =
      Number.isFinite(parsed) && parsed > 0
        ? parsed
        : DEFAULT_EXPIRES_IN_SECONDS;
  }

  /**
   * ユーザー情報から JWT（アクセストークン）を発行する。
   *
   * @param payload sub（ユーザー id）・email・role を含むクレーム
   */
  issueToken(payload: JwtPayload): IssuedToken {
    const accessToken = this.jwtService.sign(
      { email: payload.email, role: payload.role },
      {
        secret: this.secret,
        subject: payload.sub,
        expiresIn: this.expiresInSeconds,
      },
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.expiresInSeconds,
    };
  }

  /**
   * Bearer トークンを検証し、認証済みユーザー情報を返す。
   * 署名不正・期限切れ・改ざんなどの場合は例外を送出する。
   *
   * @param token 検証対象の JWT（Bearer プレフィックスは除去済み）
   */
  async verify(token: string): Promise<AuthenticatedUser> {
    const claims = await this.jwtService.verifyAsync<Record<string, unknown>>(
      token,
      { secret: this.secret },
    );

    const sub = String(claims.sub ?? '');
    const email =
      typeof claims.email === 'string' ? (claims.email as string) : undefined;
    const role =
      typeof claims.role === 'string' ? (claims.role as string) : undefined;

    return { sub, email, role, userId: sub };
  }
}
