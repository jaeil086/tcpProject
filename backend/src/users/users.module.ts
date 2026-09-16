import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { UsersService } from './users.service';

/**
 * UsersModule。
 *
 * ユーザー情報の照会（cognitoSub / id による解決、プロフィール組み立て）を担う
 * サービスのみを提供するモジュール。HTTP エンドポイントは公開しない
 * （GET /auth/me は AuthModule 側で本サービスを利用して実装する）。
 *
 * UsersService をエクスポートし、AuthModule など他モジュールから DI で利用可能にする。
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
