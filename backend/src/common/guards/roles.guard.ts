import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '../../entities/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/cognito-token-verifier';

/**
 * ロールベースのアクセス制御ガード。
 *
 * - `@Roles()` で指定された必要ロールを Reflector で読み取る。
 * - 必要ロールが指定されていないルートは常に許可する。
 * - 必要ロールが指定されている場合、`request.user.role` が許可ロールのいずれかに
 *   一致するときのみ許可する。一致しない場合は 403（ForbiddenException）を送出する（要件 4.2）。
 *
 * 本ガードは JwtAuthGuard によって `request.user` が既に付与されていることを前提とする。
 * ロールの解決元（トークンクレーム）は本タスク（6.1）時点の暫定であり、DB ユーザーによる
 * 精緻化は UsersModule（タスク 6.4）で行う。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // ロール指定がなければ認可チェックは不要
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const role = request.user?.role;

    if (!role || !requiredRoles.includes(role as UserRole)) {
      throw new ForbiddenException('この操作を行う権限がありません。');
    }

    return true;
  }
}
