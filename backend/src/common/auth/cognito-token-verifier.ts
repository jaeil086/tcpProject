import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

/**
 * JWT 検証後にリクエストへ受け渡す認証済みユーザー情報。
 * ロール（role）は本タスク（6.1）ではトークンのクレームから抽出する。
 * DB ユーザー（cognitoSub による解決）との統合・精緻化は UsersModule（タスク 6.4）で行う。
 */
export interface AuthenticatedUser {
  /** Cognito のサブジェクト識別子（User.cognitoSub に対応） */
  sub: string;
  /** メールアドレス（クレームに含まれる場合） */
  email?: string;
  /** ロール（クレームから解決。未解決の場合は undefined） */
  role?: string;
  /** 検証済みトークンの生クレーム（後続モジュールでの参照用） */
  claims: Record<string, unknown>;
}

/**
 * Cognito が発行した JWT を検証するトークン検証器。
 *
 * `aws-jwt-verify` の CognitoJwtVerifier を内部で 1 度だけ構築（キャッシュ）し、
 * JWKS のフェッチ・キャッシュ・署名検証・クレーム検証を委譲する。
 *
 * テスト容易性のため、`verify` メソッドを持つ注入可能なサービスとして切り出しており、
 * 単体テストでは本サービスをモックに差し替えることでライブ Cognito を必要としない
 * （設計書 Testing Strategy）。
 */
@Injectable()
export class CognitoTokenVerifier {
  private readonly logger = new Logger(CognitoTokenVerifier.name);

  /**
   * CognitoJwtVerifier のインスタンス。初回検証時に遅延生成し以後キャッシュする。
   * 型は verify 相当のメソッドを持つ最小構造に限定する。
   */
  private verifier: { verify(token: string): Promise<Record<string, unknown>> } | null =
    null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Bearer トークンを検証し、認証済みユーザー情報を返す。
   * 署名不正・期限切れ・改ざんなどの場合は例外を送出する。
   *
   * @param token 検証対象の JWT（Bearer プレフィックスは除去済み）
   */
  async verify(token: string): Promise<AuthenticatedUser> {
    const verifier = this.getVerifier();
    const claims = await verifier.verify(token);
    return this.toAuthenticatedUser(claims);
  }

  /**
   * CognitoJwtVerifier を遅延構築する。環境変数（COGNITO_*）から設定を読み込む。
   */
  private getVerifier(): {
    verify(token: string): Promise<Record<string, unknown>>;
  } {
    if (this.verifier) {
      return this.verifier;
    }

    const userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
    const clientId = this.configService.get<string>('COGNITO_CLIENT_ID');

    if (!userPoolId || !clientId) {
      // 設定不足時は起動時ではなく検証時に明示的に失敗させる
      this.logger.error(
        'Cognito の設定（COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID）が未設定です。',
      );
      throw new Error('Cognito verifier is not configured.');
    }

    // アクセストークンを検証する（tokenUse: 'access'）。
    // ロールは Cognito のグループ（cognito:groups）またはカスタムクレームから解決する。
    this.verifier = CognitoJwtVerifier.create({
      userPoolId,
      clientId,
      tokenUse: 'access',
    }) as unknown as {
      verify(token: string): Promise<Record<string, unknown>>;
    };

    return this.verifier;
  }

  /**
   * 検証済みクレームを AuthenticatedUser へ変換する。
   * ロールは以下の優先順で解決する（いずれも存在しない場合は undefined）。
   *   1. カスタムクレーム `custom:role`
   *   2. Cognito グループ `cognito:groups` の先頭要素
   */
  private toAuthenticatedUser(claims: Record<string, unknown>): AuthenticatedUser {
    const sub = String(claims.sub ?? '');
    const email =
      typeof claims.email === 'string' ? (claims.email as string) : undefined;
    const role = this.resolveRole(claims);

    return { sub, email, role, claims };
  }

  /**
   * クレームからロール文字列を解決する。
   */
  private resolveRole(claims: Record<string, unknown>): string | undefined {
    const customRole = claims['custom:role'];
    if (typeof customRole === 'string' && customRole.length > 0) {
      return customRole;
    }

    const groups = claims['cognito:groups'];
    if (Array.isArray(groups) && groups.length > 0) {
      return String(groups[0]);
    }

    return undefined;
  }
}
