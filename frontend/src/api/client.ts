// Feature: ai-team-planner
// バックエンド API 呼び出しの共通 fetch ラッパー。
//
// 設計方針:
// - ベース URL は Vite の環境変数 VITE_API_BASE_URL から読み取り（既定 'http://localhost:3000'）、
//   バックエンドのグローバルプレフィックス '/api' を必ず付与する。
// - アクセストークンは「トークンプロバイダ」を介して取得する。既定では localStorage の
//   'accessToken' キーを読むが、setAuthTokenGetter で AuthProvider（タスク 13）から
//   任意の取得関数を注入できるようにし、状態管理の実装詳細から本モジュールを疎結合に保つ。
// - トークンが存在する場合のみ Authorization: Bearer <accessToken> を付与する。
// - JSON をパースし、非 2xx 応答では ErrorResponse を保持する型付き例外（ApiError）を投げる。
//   これにより呼び出し側・UI は errorCode / statusCode を用いて 401 リダイレクトや
//   しきい値エラー表示（要件 4.4）などの日本語メッセージ分岐を実装できる。

import type { ErrorResponse } from '../types';

/** localStorage 上でアクセストークンを保持するキー。 */
export const ACCESS_TOKEN_STORAGE_KEY = 'accessToken';

/**
 * API のベース URL を解決する。
 * VITE_API_BASE_URL が未設定の場合は 'http://localhost:3000' を用いる。
 * 末尾スラッシュは重複を避けるため除去する。
 */
function resolveBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

/**
 * 現在のアクセストークンを返すトークンプロバイダの型。
 * トークンが無い（未ログイン）場合は null を返す。
 */
export type AuthTokenGetter = () => string | null;

/**
 * 既定のトークンプロバイダ。localStorage の 'accessToken' を読む。
 * SSR など window が存在しない環境では null を返す。
 */
const defaultTokenGetter: AuthTokenGetter = () => {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
};

/** 現在のトークンプロバイダ（差し替え可能）。 */
let tokenGetter: AuthTokenGetter = defaultTokenGetter;

/**
 * トークンプロバイダを差し替える。
 * AuthProvider（タスク 13）が自身の状態からトークンを供給できるようにする。
 *
 * @param getter 現在のアクセストークンを返す関数
 */
export function setAuthTokenGetter(getter: AuthTokenGetter): void {
  tokenGetter = getter;
}

/**
 * API 呼び出し失敗時に投げられる型付き例外。
 * バックエンドの ErrorResponse を保持し、UI での日本語メッセージ分岐に用いる。
 */
export class ApiError extends Error {
  /** HTTP ステータスコード */
  readonly statusCode: number;
  /** アプリ固有のエラーコード（例: UNAUTHORIZED, FORBIDDEN） */
  readonly errorCode: string;
  /** サーバーが返した ErrorResponse（パースできた場合） */
  readonly response?: ErrorResponse;

  constructor(statusCode: number, errorCode: string, message: string, response?: ErrorResponse) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.response = response;
  }
}

/** HTTP メソッド種別。 */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * fetch のオプション（ボディ・クエリ）。
 */
interface RequestOptions {
  /** クエリパラメータ（undefined 値は送出しない） */
  query?: Record<string, string | number | boolean | undefined>;
  /** リクエストボディ（JSON 化して送出する） */
  body?: unknown;
}

/**
 * パス（'/api' プレフィックス配下の相対パス）とクエリから完全な URL を構築する。
 */
function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = resolveBaseUrl();
  // path は '/auth/login' のように先頭スラッシュ付きを想定する。'/api' を必ず付与する。
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}/api${normalizedPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * 応答が非 2xx のときに ErrorResponse をパースし、ApiError を組み立てる。
 * サーバーが期待形式の JSON を返さない場合でも、ステータスから最低限の ApiError を生成する。
 */
async function toApiError(response: Response): Promise<ApiError> {
  let parsed: ErrorResponse | undefined;
  try {
    const data = (await response.json()) as Partial<ErrorResponse>;
    if (data && typeof data === 'object') {
      parsed = {
        statusCode: data.statusCode ?? response.status,
        errorCode: data.errorCode ?? 'UNKNOWN',
        message: data.message ?? response.statusText,
      };
    }
  } catch {
    // JSON でない・空ボディなどはフォールバックへ。
  }

  const statusCode = parsed?.statusCode ?? response.status;
  const errorCode = parsed?.errorCode ?? 'UNKNOWN';
  const message = parsed?.message ?? `リクエストに失敗しました（HTTP ${response.status}）`;
  return new ApiError(statusCode, errorCode, message, parsed);
}

/**
 * 共通のリクエスト実行関数。
 * - Authorization ヘッダーをトークンがあれば付与する。
 * - JSON をパースして返す。204 No Content の場合は undefined を返す。
 * - 非 2xx では ApiError を投げる。
 */
async function request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const token = tokenGetter();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  // 204 No Content やボディ無しの場合は undefined を返す。
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/**
 * API クライアント。各 API モジュール（schedules / calendar など）から利用する。
 */
export const apiClient = {
  /** GET リクエスト。 */
  get<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    return request<T>('GET', path, { query });
  },
  /** POST リクエスト。 */
  post<T>(path: string, body?: unknown, query?: RequestOptions['query']): Promise<T> {
    return request<T>('POST', path, { body, query });
  },
  /** PUT リクエスト。 */
  put<T>(path: string, body?: unknown, query?: RequestOptions['query']): Promise<T> {
    return request<T>('PUT', path, { body, query });
  },
  /** DELETE リクエスト。 */
  delete<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    return request<T>('DELETE', path, { query });
  },
};
