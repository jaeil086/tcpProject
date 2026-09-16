import { Matches, IsString } from 'class-validator';

/**
 * PUT /schedules/me のリクエストボディ DTO（要件 2.1〜2.5）。
 *
 * ここでは「形式レベル」の検証のみを行う（class-validator）。
 * - date: 'YYYY-MM-DD' 形式であること（暦上の妥当性・Target_Week 範囲内かは
 *   ドメイン関数 isWithinTargetWeek でサービス層が検証する）。
 * - workLocation: 文字列であること（'office' / 'remote' の妥当性は
 *   ドメイン関数 assertWorkLocation でサービス層が検証する。要件 2.2、2.3）。
 *
 * 深いバリデーションをドメイン層へ委譲することで、純粋関数のテスト（タスク 4.2/4.4）と
 * API の判定ロジックを単一の情報源に揃える。
 */
export class UpsertScheduleDto {
  /** 対象日（YYYY-MM-DD、Target_Week 内であること） */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "date は 'YYYY-MM-DD' 形式で指定してください。",
  })
  date: string;

  /** 勤務区分（office / remote）。値の妥当性はサービス層で検証する。 */
  @IsString()
  workLocation: string;
}
