/**
 * バックエンド共通の統一エラー応答形式。
 * すべての例外は例外フィルタでこの形式に変換され、フロントエンドは
 * `errorCode` を解釈してユーザー向けの日本語メッセージを表示・分岐する（設計書 Error Handling）。
 */
export interface ErrorResponse {
  /** HTTP ステータスコード */
  statusCode: number;
  /** アプリ固有のエラーコード（例: UNAUTHORIZED, FORBIDDEN） */
  errorCode: string;
  /** ユーザー向け日本語メッセージ */
  message: string;
}

/**
 * アプリ固有のエラーコード定義。
 * 表記ゆれを防ぐため一箇所に集約する。
 */
export const ErrorCode = {
  /** 未認証・トークン欠如・検証失敗・期限切れ（401） */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** 権限不足（403） */
  FORBIDDEN: 'FORBIDDEN',
  /** 入力値の検証エラー（400） */
  BAD_REQUEST: 'BAD_REQUEST',
  /** リソースが存在しない（404） */
  NOT_FOUND: 'NOT_FOUND',
  /** 想定外のサーバーエラー（500） */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
