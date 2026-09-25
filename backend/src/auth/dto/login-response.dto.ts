/**
 * POST /auth/login のレスポンス。
 *
 * 自前認証成功時に返却する自己発行トークン。フロントエンドはこれを保持し、
 * 以後の API 呼び出しで `Authorization: Bearer <accessToken>` を付与する。
 */
export interface LoginResponse {
  /** アクセストークン（保護 API へのアクセスに用いる自己発行 JWT） */
  accessToken: string;
  /** トークン種別（通常は "Bearer"） */
  tokenType: string;
  /** アクセストークンの有効期限（秒） */
  expiresIn: number;
}
