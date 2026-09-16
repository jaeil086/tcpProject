import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { UsersModule } from '../users/users.module';
import { Schedule } from '../entities/schedule.entity';
import { User } from '../entities/user.entity';
import { ThresholdSetting } from '../entities/threshold-setting.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * DashboardModule。
 *
 * 管理者向けのダッシュボード集計（GET /dashboard/occupancy・GET /dashboard/attendees）と
 * しきい値管理（GET/PUT /dashboard/threshold）を提供する（要件 4.1〜4.7）。
 * - Schedule / User / ThresholdSetting エンティティを forFeature で登録する。
 * - CommonModule を import し、DashboardController の `@UseGuards(JwtAuthGuard, RolesGuard)` が
 *   依存する CognitoTokenVerifier / 各ガードを DI で解決できるようにする（要件 4.2）。
 * - UsersModule を import し、Cognito サブジェクト識別子から更新者（Administrator）を
 *   解決する UsersService を利用する（しきい値更新の updatedBy 記録。要件 4.3）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, User, ThresholdSetting]),
    CommonModule,
    UsersModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
