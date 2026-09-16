import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../entities/enums';

/**
 * `@Roles()` デコレータのメタデータキー。
 * RolesGuard が Reflector 経由でこのキーの値（許可ロール一覧）を読み取る。
 */
export const ROLES_KEY = 'roles';

/**
 * ルート（コントローラ／ハンドラ）に必要なロールを付与するデコレータ。
 * 指定したロールのいずれかを持つユーザーのみアクセスを許可する（要件 4.2）。
 *
 * 使用例:
 *   @Roles(UserRole.Administrator)
 *   @Get('/dashboard/occupancy')
 *   getOccupancy() { ... }
 *
 * @param roles 許可するロールの一覧
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
