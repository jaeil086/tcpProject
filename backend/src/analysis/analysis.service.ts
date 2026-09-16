import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Schedule } from '../entities/schedule.entity';
import { DashboardService } from '../dashboard/dashboard.service';
import { resolveTargetWeek } from '../domain/target-week';
import { ScheduleRecord } from '../domain/occupancy';
import { evaluateAnalysis } from '../domain/analysis-eval';
import { AnalysisRunResponse } from './dto/analysis-response.dto';

/**
 * AI 分析の実行を担うサービス（AnalysisModule、要件 5.1〜5.4、5.6、5.7）。
 *
 * 責務:
 * - Target_Week（翌週の月〜日 7 日分）の勤務予定を組織全体で取得する。
 * - しきい値設定は DashboardService.getThreshold() を再利用して取得し、
 *   しきい値の情報源（ThresholdSetting）を単一に保つ。
 * - 過多／過少警告と日別パターン要約の生成は純粋ドメイン関数
 *   evaluateAnalysis へ委譲し、集計ロジックを二重管理しない（要件 5.2〜5.4）。
 * - 対象週の勤務予定が 0 件の場合は分析対象データなしとして扱い、
 *   警告・要約を生成しない（要件 5.6）。
 *
 * 読み取り専用性について（要件 5.7）:
 * - 本サービスは勤務予定を repository.find で読み取り、メモリ上で集計するだけであり、
 *   Schedule を一切更新・削除・保存しない。したがって分析処理は勤務予定データを変更しない。
 * - データ取得や評価の途中で例外が発生した場合も、書き込みを行わないため既存の勤務予定は
 *   そのまま保持される。例外はそのまま伝播させ、グローバルの HttpExceptionFilter が
 *   統一エラー応答へ変換する（要件 5.7）。
 */
@Injectable()
export class AnalysisService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    private readonly dashboardService: DashboardService,
  ) {}

  /**
   * AI 分析を実行し、警告メッセージと勤務パターン要約を返す（要件 5.1〜5.4、5.6、5.7）。
   *
   * 分析は読み取り専用であり、勤務予定データを変更しない（要件 5.7）。
   *
   * @param weekStartInput 週の起点日（YYYY-MM-DD）。省略時はサーバー現在日から翌週を導出する。
   */
  async runAnalysis(weekStartInput?: string): Promise<AnalysisRunResponse> {
    // 対象週を決定する。指定があればそれを基準日に、なければサーバー現在日を基準に翌週を導出する。
    const referenceDate = weekStartInput ?? this.getServerToday();
    const { weekStart, dates } = resolveTargetWeek(referenceDate);

    // 対象 7 日分の勤務予定を全ユーザー分取得する（組織全体の分析。読み取りのみ。要件 5.7）。
    const schedules = await this.scheduleRepository.find({
      where: { date: In(dates as string[]) },
    });

    // 要件 5.6: 対象週に勤務予定が 1 件も存在しない場合は、分析対象データなしとして
    // 警告・要約を生成せず、対象なしメッセージを返す。
    if (schedules.length === 0) {
      return {
        targetWeekStart: weekStart,
        hasData: false,
        message: '分析対象となる勤務予定データが存在しません。',
        warnings: [],
        summary: [],
      };
    }

    // 純粋関数へ渡すためのプレーン型へ変換する。
    const records: ScheduleRecord[] = schedules.map((schedule) => ({
      userId: schedule.userId,
      date: schedule.date,
      workLocation: schedule.workLocation,
    }));

    // 現在のしきい値設定を取得する（未設定時は既定値。情報源は DashboardService に集約）。
    const thresholds = await this.dashboardService.getThreshold();

    // 過多／過少警告と日別パターン要約を純粋ドメインで生成する（要件 5.2〜5.4）。
    const { warnings, summary } = evaluateAnalysis(records, dates, thresholds);

    return {
      targetWeekStart: weekStart,
      hasData: true,
      generatedAt: new Date().toISOString(),
      warnings,
      summary,
    };
  }

  /**
   * サーバー現在日を UTC の 'YYYY-MM-DD' 文字列で返す（Target_Week 導出の基準日）。
   * ドメイン層が UTC 固定で計算するため、基準日も UTC で統一し他サービスと揃える。
   */
  private getServerToday(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
