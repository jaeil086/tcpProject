import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { User } from '../entities/user.entity';
import { Team } from '../entities/team.entity';
import { UsersController } from './users.controller';
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
 *
 * さらに管理者専用のユーザー管理エンドポイント（UsersController: GET /users、
 * PUT /users/:id/team、PUT /users/:id/role）をホストする。
 * - Team エンティティを forFeature に追加し、チーム割り当て時の実在チェックに用いる。
 * - CommonModule を import し、UsersController の
 *   `@UseGuards(JwtAuthGuard, RolesGuard)` が依存する JwtTokenService / 各ガードを
 *   本モジュールの DI コンテキストで解決できるようにする。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User, Team]), CommonModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
