import { Module } from '@nestjs/common';
import { CognitoTokenVerifier } from './auth/cognito-token-verifier';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UsersModule } from '../users/users.module';

/**
 * 共通基盤モジュール。
 *
 * 認証・認可に用いる DI 対象（CognitoTokenVerifier / JwtAuthGuard / RolesGuard）を
 * まとめて提供・エクスポートする。各機能モジュール（TeamsModule など）で
 * `@UseGuards(JwtAuthGuard)` を利用する際、ガードが依存する CognitoTokenVerifier を
 * 当該モジュールの DI コンテキストで解決できるようにするため、本モジュールを
 * import して依存を注入可能にする。
 *
 * JwtAuthGuard は cognito_sub から DB ユーザーのロールを解決するため UsersService に
 * 依存する。そのため UsersModule を import する（UsersModule は UsersService を
 * エクスポートしている）。UsersModule は CommonModule を import しないため循環依存は生じない。
 *
 * 例外フィルタ（HttpExceptionFilter）は APP_FILTER としてルートモジュール側で
 * グローバル登録するため、本モジュールには含めない。
 */
@Module({
  imports: [UsersModule],
  providers: [CognitoTokenVerifier, JwtAuthGuard, RolesGuard],
  exports: [CognitoTokenVerifier, JwtAuthGuard, RolesGuard],
})
export class CommonModule {}
