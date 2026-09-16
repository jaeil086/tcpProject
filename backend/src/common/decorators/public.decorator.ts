import { SetMetadata } from '@nestjs/common';

/**
 * `@Public()` デコレータのメタデータキー。
 * JwtAuthGuard が Reflector 経由でこのキーを読み取り、認証不要ルートを判定する。
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 認証不要（公開）ルートであることを示すデコレータ。
 * `POST /auth/login` のように JWT を要求しないエンドポイントに付与する（要件 1）。
 *
 * 使用例:
 *   @Public()
 *   @Post('/auth/login')
 *   login() { ... }
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
