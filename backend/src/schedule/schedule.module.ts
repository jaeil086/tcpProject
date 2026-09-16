import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { UsersModule } from '../users/users.module';
import { Schedule } from '../entities/schedule.entity';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

/**
 * ScheduleModule。
 *
 * 勤務予定の登録・更新（PUT /schedules/me）と照会（GET /schedules/me）を提供する。
 * - Schedule エンティティを forFeature で登録する。
 * - CommonModule を import し、`@UseGuards(JwtAuthGuard, RolesGuard)` が依存する
 *   CognitoTokenVerifier / 各ガードを DI で解決できるようにする。
 * - UsersModule を import し、Cognito サブジェクト識別子から DB ユーザー（内部 userId）を
 *   解決する UsersService を利用する。
 * - ScheduleService は後続のカレンダー集約（タスク 8）から利用されるためエクスポートする。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Schedule]), CommonModule, UsersModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
