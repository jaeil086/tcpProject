import { AdminUserView } from '../users.service';

/**
 * PUT /users/:id/password のレスポンス DTO（最上位管理者専用）。
 *
 * 一時パスワード（temporaryPassword）は再設定直後に 1 回だけ返す平文であり、
 * サーバー側には保存されない（DB にはハッシュのみ保持）。管理者はこれを対象ユーザーへ
 * 安全な経路で伝達し、ユーザーは初回ログイン後に自身で変更することを想定する。
 */
export class ResetPasswordResponseDto {
  /** 対象ユーザーの管理者向けビュー（パスワードハッシュは含まない）。 */
  user: AdminUserView;

  /** 生成された一時パスワード（平文。この応答でのみ返す）。 */
  temporaryPassword: string;
}
