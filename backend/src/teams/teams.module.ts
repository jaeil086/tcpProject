import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { Team } from '../entities/team.entity';
import { User } from '../entities/user.entity';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

/**
 * TeamsModule。
 *
 * チーム一覧（GET /teams）とチーム別メンバー取得を提供する。
 * - Team / User エンティティを forFeature で登録する。
 * - CommonModule を import し、TeamsController の `@UseGuards(JwtAuthGuard)` が
 *   依存する CognitoTokenVerifier / JwtAuthGuard を DI で解決できるようにする。
 * - TeamsService はカレンダー集約（タスク 8）から利用されるためエクスポートする。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Team, User]), CommonModule],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
