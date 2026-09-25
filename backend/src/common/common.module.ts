import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtTokenService } from './auth/jwt-token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * 共通基盤モジュール。
 *
 * 認証・認可に用いる DI 対象（JwtTokenService / JwtAuthGuard / RolesGuard）を
 * まとめて提供・エクスポートする。各機能モジュール（Teams / Schedule など）で
 * `@UseGuards(JwtAuthGuard)` を利用する際、ガードが依存する JwtTokenService を
 * 当該モジュールの DI コンテキストで解決できるようにするため、本モジュールを
 * import して依存を注入可能にする。
 *
 * JwtModule は @nestjs/jwt の JwtService を提供する。署名・検証時の秘密鍵は
 * JwtTokenService が JWT_SECRET（環境変数）からリクエストごとに指定するため、
 * ここではモジュール既定の秘密鍵は設定しない。
 *
 * 例外フィルタ（HttpExceptionFilter）は APP_FILTER としてルートモジュール側で
 * グローバル登録するため、本モジュールには含めない。
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [JwtTokenService, JwtAuthGuard, RolesGuard],
  exports: [JwtTokenService, JwtAuthGuard, RolesGuard],
})
export class CommonModule {}
