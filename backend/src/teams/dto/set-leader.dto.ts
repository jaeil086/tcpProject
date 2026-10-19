import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

/**
 * PUT /teams/:id/leader のリクエストボディ DTO（最上位管理者専用）。
 *
 * leaderId にユーザー ID（UUID）を指定するとそのユーザーをリーダーに設定する。
 * null を指定した場合はリーダーを解除する。
 * （null 以外のときのみ UUID 形式を検証する。）
 */
export class SetLeaderDto {
  /** リーダーに設定するユーザー ID（解除する場合は null）。 */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4', { message: 'leaderId は有効なユーザー ID を指定してください。' })
  leaderId: string | null;
}
