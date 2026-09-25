import { Global, Module } from '@nestjs/common';
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
 * JwtAuthGuard は各機能モジュール（Teams / Schedule / Calendar / Dashboard / Analysis）で
 * `@UseGuards` により利用され、その都度当該モジュールの DI コンテキストで
 * インスタンス化される。ガードが依存する UsersService をどのモジュールからでも
 * 解決できるように、本モジュールを @Global() とし UsersService をグローバルに提供する。
 * これにより、各機能モジュールが個別に UsersModule を import しなくても
 * ガードの依存を解決できる。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
