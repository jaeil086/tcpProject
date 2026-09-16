import { IsInt } from 'class-validator';

/**
 * PUT /dashboard/threshold のリクエストボディ DTO（要件 4.3、4.4）。
 *
 * ここでは「型レベル」の検証のみを行う（class-validator の @IsInt）。
 * - 0〜100 の範囲チェックおよび upper > lower のクロスフィールド検証は、
 *   単一の情報源であるドメイン層（ThresholdValidator の isValidThreshold /
 *   assertThreshold）へ委譲し、サービス層で行う。
 * - これにより、純粋関数のテスト（タスク 4.9）と API の判定ロジックを揃える。
 */
export class UpdateThresholdDto {
  /** 出社上限しきい値（0〜100 の整数。範囲・大小関係はサービス層で検証する） */
  @IsInt({ message: 'upperThreshold は整数で指定してください。' })
  upperThreshold: number;

  /** 出社下限しきい値（0〜100 の整数。範囲・大小関係はサービス層で検証する） */
  @IsInt({ message: 'lowerThreshold は整数で指定してください。' })
  lowerThreshold: number;
}
