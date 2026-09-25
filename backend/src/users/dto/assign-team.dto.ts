import { IsUUID, ValidateIf } from 'class-validator';

/**
 * PUT /users/:id/team のリクエストボディ DTO（管理者専用）。
 *
 * teamId には次のいずれかを許容する:
 * - チームの UUID 文字列（該当チームへ割り当て）
 * - null（未所属化）
 *
 * null 以外が指定された場合のみ UUID 形式を検証する（@ValidateIf で null をスキップ）。
 * チームの実在チェックはサービス層（UsersService.assignTeam）で行う。
 */
export class AssignTeamDto {
  /** 割り当てるチーム ID（UUID）。未所属にする場合は null。 */
  @ValidateIf((o: AssignTeamDto) => o.teamId !== null)
  @IsUUID('4', { message: 'teamId は UUID 形式で指定してください。' })
  teamId: string | null;
}
