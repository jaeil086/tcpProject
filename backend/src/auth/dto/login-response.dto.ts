/**
 * POST /auth/login のレスポンス。
 *
 * Cognito 認証成功時に返却するトークン群。フロントエンドはこれらを保持し、
 * 以後の API 呼び出しで `Authorization: Bearer <accessToken>` を付与する（要件 1.2）。
 */
export interface LoginResponse {
  /** ID トークン（ユーザー属性クレームを含む JWT） */
  idToken: string;
  /** アクセストークン（保護 API へのアクセスに用いる JWT） */
  accessToken: string;
  /** アクセストークンの有効期限（秒） */
  expiresIn: number;
  /** トークン種別（通常は "Bearer"） */
  tokenType: string;
}
