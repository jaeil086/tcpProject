import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { cognitoClientProvider } from './cognito.provider';

/**
 * AuthModule。
 *
 * 認証関連のエンドポイント（POST /auth/login, POST /auth/logout, GET /auth/me）を提供する。
 * - CommonModule を import し、AuthController の `@UseGuards(JwtAuthGuard)` が依存する
 *   CognitoTokenVerifier / JwtAuthGuard を DI で解決できるようにする。
 * - UsersModule を import し、GET /auth/me で UsersService（プロフィール解決）を利用する。
 * - cognitoClientProvider により AWS SDK の Cognito クライアントを注入する
 *   （単体テストではフェイクへ差し替え可能）。
 */
@Module({
  imports: [CommonModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, cognitoClientProvider],
  exports: [AuthService],
})
export class AuthModule {}
