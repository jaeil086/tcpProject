import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { COGNITO_CLIENT } from './cognito.provider';
import { LoginResponse } from './dto/login-response.dto';

/**
 * 認証（Cognito 連携）を担うサービス。
 *
 * 責務（設計書 AuthModule / 要件 1.2〜1.5, 1.7）:
 * - メールアドレス／パスワードによる Cognito 認証（InitiateAuth / USER_PASSWORD_AUTH）
 * - 認証失敗・ロックアウト・認証基盤障害を適切な HTTP 例外へマッピング
 * - ログアウト時のトークン無効化（GlobalSignOut によるトークン失効）
 *
 * Cognito クライアントは COGNITO_CLIENT トークン経由で注入し、単体テスト（タスク 6.3）では
 * フェイククライアントへ差し替え可能にする（設計書 Testing Strategy）。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(COGNITO_CLIENT)
    private readonly cognitoClient: CognitoIdentityProviderClient,
    private readonly configService: ConfigService,
  ) {}

  /**
   * メールアドレス／パスワードで Cognito 認証を行い、成功時にトークンを返す（要件 1.2）。
   *
   * Cognito のエラーは設計書 Error Handling の分類に従いマッピングする:
   * - 資格情報不一致・未登録（NotAuthorizedException / UserNotFoundException） -> 401（要件 1.3）
   * - 連続失敗によるロックアウト（"Password attempts exceeded"） -> 423（要件 1.4）
   * - Cognito 無応答・システムエラー（InternalError / ネットワーク等） -> 503（要件 1.5）
   *
   * @param email ログインメールアドレス
   * @param password ログインパスワード
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const clientId = this.configService.get<string>('COGNITO_CLIENT_ID');
    if (!clientId) {
      // 設定不足は認証基盤の不備として 503 とする（要件 1.5）
      this.logger.error('COGNITO_CLIENT_ID が未設定です。');
      throw new ServiceUnavailableException(
        '現在認証を行えません。時間をおいて再度お試しください。',
      );
    }

    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    let response;
    try {
      response = await this.cognitoClient.send(command);
    } catch (error) {
      // Cognito 由来のエラーを分類して HTTP 例外へ変換する
      throw this.mapCognitoError(error);
    }

    const result = response.AuthenticationResult;
    if (
      !result ||
      !result.IdToken ||
      !result.AccessToken ||
      result.ExpiresIn === undefined
    ) {
      // チャレンジ応答（MFA 等）やトークン欠如は本 MVP では未対応のため 401 として扱う
      this.logger.warn(
        'Cognito から認証トークンを取得できませんでした（チャレンジ要求の可能性）。',
      );
      throw new UnauthorizedException(
        'メールアドレスまたはパスワードが正しくありません。',
      );
    }

    return {
      idToken: result.IdToken,
      accessToken: result.AccessToken,
      expiresIn: result.ExpiresIn,
      tokenType: result.TokenType ?? 'Bearer',
    };
  }

  /**
   * アクセストークンを無効化する（要件 1.7）。
   *
   * Cognito のアクセストークンはステートレスな JWT だが、GlobalSignOut により
   * サーバー側で当該ユーザーの発行済みトークンを失効させる（実質的な無効化）。
   * 失効に失敗した場合でも、クライアントはトークンを破棄するためログアウト自体は成立する。
   * ここでは失敗をログに残し、ユーザーには成功として扱う（要件 1.7）。
   *
   * @param accessToken 無効化対象のアクセストークン
   */
  async logout(accessToken: string): Promise<void> {
    try {
      await this.cognitoClient.send(
        new GlobalSignOutCommand({ AccessToken: accessToken }),
      );
    } catch (error) {
      // トークンが既に失効している等の理由で失敗しても、クライアント側破棄により
      // ログアウトは成立するため、エラーはログに留めて握りつぶす。
      this.logger.warn(
        `GlobalSignOut に失敗しました（トークンは破棄されます）: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Cognito のエラーを設計書の分類に従い HTTP 例外へマッピングする。
   *
   * Cognito のロックアウト（連続失敗）は Cognito 側が強制し、NotAuthorizedException に
   * "Password attempts exceeded" というメッセージで通知されるため、その信号を 423 に翻訳する。
   *
   * @param error cognitoClient.send が送出したエラー
   */
  private mapCognitoError(error: unknown): HttpException {
    const name = this.resolveErrorName(error);
    const message = error instanceof Error ? error.message : String(error);

    // ロックアウト: 連続ログイン失敗の上限超過（要件 1.4）
    // Cognito は NotAuthorizedException のメッセージでロックを通知する。
    if (/password attempts exceeded/i.test(message)) {
      this.logger.warn(`ログインロックアウトを検知しました: ${message}`);
      // NestJS には 423 Locked の専用例外・列挙値がないため、数値ステータス 423 を直接指定する。
      return new HttpException(
        'ログイン試行回数の上限に達しました。しばらくしてから再度お試しください。',
        423,
      );
    }

    // 認証失敗: 資格情報不一致・未登録（要件 1.3）
    if (
      name === 'NotAuthorizedException' ||
      name === 'UserNotFoundException'
    ) {
      this.logger.warn(`認証に失敗しました: ${name}`);
      return new UnauthorizedException(
        'メールアドレスまたはパスワードが正しくありません。',
      );
    }

    // 認証基盤障害: Cognito 無応答・内部エラー・ネットワーク等（要件 1.5）
    this.logger.error(
      `認証基盤でエラーが発生しました: ${name} ${message}`,
    );
    return new ServiceUnavailableException(
      '現在認証を行えません。時間をおいて再度お試しください。',
    );
  }

  /**
   * エラーオブジェクトから Cognito の例外名を取り出す。
   * AWS SDK v3 は `name` に例外名を設定する。
   */
  private resolveErrorName(error: unknown): string {
    if (error && typeof error === 'object' && 'name' in error) {
      const name = (error as { name?: unknown }).name;
      if (typeof name === 'string') {
        return name;
      }
    }
    return 'UnknownError';
  }
}
