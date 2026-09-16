import { ConfigService } from '@nestjs/config';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

/**
 * AuthService が利用する Cognito クライアントの DI トークン。
 *
 * AWS SDK の CognitoIdentityProviderClient をプロバイダとして注入することで、
 * 単体テスト（タスク 6.3）では本トークンをフェイククライアントに差し替えられる
 * ようにする（設計書 Testing Strategy: Cognito はモック化する）。
 */
export const COGNITO_CLIENT = 'COGNITO_CLIENT';

/**
 * CognitoIdentityProviderClient を生成するファクトリプロバイダ。
 * リージョンは環境変数 COGNITO_REGION から解決する（既定は ap-northeast-1）。
 */
export const cognitoClientProvider = {
  provide: COGNITO_CLIENT,
  useFactory: (configService: ConfigService): CognitoIdentityProviderClient => {
    const region =
      configService.get<string>('COGNITO_REGION') ?? 'ap-northeast-1';
    return new CognitoIdentityProviderClient({ region });
  },
  inject: [ConfigService],
};
