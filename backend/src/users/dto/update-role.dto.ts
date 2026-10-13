import { IsEnum } from 'class-validator';
import { UserRole } from '../../entities/enums';

/**
 * PUT /users/:id/role のリクエストボディ DTO（最上位管理者専用）。
 *
 * role は UserRole（'employee' / 'team_admin' / 'super_admin'）のいずれかのみ許容する。
 * それ以外の値は class-validator（@IsEnum）で 400 として拒否する。
 */
export class UpdateRoleDto {
  /** 変更後のロール（employee / team_admin / super_admin） */
  @IsEnum(UserRole, {
    message:
      "role は 'employee'、'team_admin'、'super_admin' のいずれかを指定してください。",
  })
  role: UserRole;
}
