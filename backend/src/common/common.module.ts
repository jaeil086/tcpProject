import { Module } from '@nestjs/common';
import { CognitoTokenVerifier } from './auth/cognito-token-verifier';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * 共通基盤モジュール。
 *
 * 認証・認可に用いる DI 対象（CognitoTokenVerifier / JwtAuthGuard / RolesGuard）を
 * まとめて提供・エクスポートする。各機能モジュール（TeamsModule など）で
 * `@UseGuards(JwtAuthGuard)` を利用する際、ガードが依存する CognitoTokenVerifier を
 * 当該モジュールの DI コンテキストで解決できるようにするため、本モジュールを
 * import して依存を注入可能にする。
 *
 * 例外フィルタ（HttpExceptionFilter）は APP_FILTER としてルートモジュール側で
 * グローバル登録するため、本モジュールには含めない。
 */
@Module({
  providers: [CognitoTokenVerifier, JwtAuthGuard, RolesGuard],
  exports: [CognitoTokenVerifier, JwtAuthGuard, RolesGuard],
})
export class CommonModule {}
