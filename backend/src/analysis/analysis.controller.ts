import { Controller, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../entities/enums';
import { AnalysisService } from './analysis.service';
import { AnalysisRunResponse } from './dto/analysis-response.dto';

/**
 * AI 分析の REST エンドポイント（AnalysisModule）。
 *
 * グローバルプレフィックス（api）により実際のパスは `/api/analysis/*` となる。
 * - POST /analysis/run?weekStart=: Target_Week の AI 分析を実行し、
 *   過多／過少警告と日別パターン要約を返す（要件 5.1〜5.4、5.6）。
 *
 * 認可（設計書 API 一覧「要認証（Administrator）」、要件 5）:
 * - JwtAuthGuard で認証必須とし、RolesGuard + @Roles(Administrator) により
 *   Administrator 以外のアクセスを 403 で拒否する。
 *
 * コントローラは薄く保ち、分析ロジックはすべて AnalysisService に委譲する。
 * 分析は読み取り専用であり、勤務予定データを変更しない（要件 5.7）。
 */
@Controller('analysis')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Administrator)
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  /**
   * POST /analysis/run?weekStart=YYYY-MM-DD
   * Target_Week の AI 分析を実行する（要件 5.1〜5.4、5.6）。
   * weekStart 省略時はサーバー現在日から翌週を対象とする。
   */
  @Post('run')
  async run(
    @Query('weekStart') weekStart?: string,
  ): Promise<AnalysisRunResponse> {
    return this.analysisService.runAnalysis(weekStart);
  }
}
