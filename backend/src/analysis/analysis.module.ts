import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { Schedule } from '../entities/schedule.entity';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

/**
 * AnalysisModule。
 *
 * 管理者向けの AI 分析実行（POST /analysis/run）を提供する（要件 5.1〜5.4、5.6、5.7）。
 * - Schedule エンティティを forFeature で登録し、Target_Week の勤務予定を読み取る。
 * - CommonModule を import し、AnalysisController の `@UseGuards(JwtAuthGuard, RolesGuard)` が
 *   依存する JwtTokenService / 各ガードを DI で解決できるようにする。
 * - DashboardModule を import し、しきい値設定を DashboardService.getThreshold() から
 *   取得する。これにより、しきい値の情報源（ThresholdSetting）を単一に保つ。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule]),
    CommonModule,
    DashboardModule,
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService],
})
export class AnalysisModule {}
