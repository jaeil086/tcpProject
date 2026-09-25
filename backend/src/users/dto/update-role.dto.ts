import { IsEnum } from 'class-validator';
import { UserRole } from '../../entities/enums';

/**
 * PUT /users/:id/role のリクエストボディ DTO（管理者専用）。
 *
 * role は UserRole（'employee' / 'administrator'）のいずれかのみ許容する。
 * それ以外の値は class-validator（@IsEnum）で 400 として拒否する。
 */
export class UpdateRoleDto {
  /** 変更後のロール（employee / administrator） */
  @IsEnum(UserRole, {
    message: "role は 'employee' または 'administrator' を指定してください。",
  })
  role: UserRole;
}
