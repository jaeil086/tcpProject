import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * AuthModule。
 *
 * 認証関連のエンドポイント（POST /auth/register, /auth/login, /auth/logout, GET /auth/me）を提供する。
 * - CommonModule を import し、AuthController の `@UseGuards(JwtAuthGuard)` が依存する
 *   JwtAuthGuard、および AuthService が利用する JwtTokenService を DI で解決できるようにする。
 * - UsersModule を import し、登録・ログイン・プロフィール解決で UsersService を利用する
 *   （UsersModule は @Global だが、依存を明示するため import する）。
 */
@Module({
  imports: [CommonModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
