import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { UsersModule } from '../users/users.module';
import { TeamsModule } from '../teams/teams.module';
import { Schedule } from '../entities/schedule.entity';
import { User } from '../entities/user.entity';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/**
 * CalendarModule。
 *
 * チーム単位の週次勤務予定の集約（GET /calendar）を提供する。
 * - Schedule / User エンティティを forFeature で登録する。
 * - CommonModule を import し、CalendarController の `@UseGuards(JwtAuthGuard)` が
 *   依存する JwtTokenService / JwtAuthGuard を DI で解決できるようにする。
 * - UsersModule を import し、トークン由来の userId からリクエストユーザー（自チーム解決）を
 *   得る UsersService を利用する（要件 3.4）。
 * - TeamsModule を import し、チーム別メンバー取得（チームフィルタ）を行う TeamsService を利用する（要件 3.3）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, User]),
    CommonModule,
    UsersModule,
    TeamsModule,
  ],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
