// Feature: ai-team-planner
// 認証状態を管理する React コンテキストプロバイダ（要件 1.1〜1.3、1.6、1.7）。
//
// 設計方針:
// - アクセストークンは localStorage に永続化し（cognito.ts のヘルパー経由）、
//   ユーザープロフィール（UserProfile）は /auth/me で解決してメモリ上に保持する。
// - マウント時にトークンが存在すれば getMe() でプロフィールを復元（ハイドレート）する。
//   getMe() が 401（ApiError.statusCode === 401）を返した場合はトークン失効／無効とみなし、
//   トークンとユーザーを破棄する（要件 1.6）。
// - api クライアントには setAuthTokenGetter で「現在のトークンを返す関数」を注入し、
//   保護 API 呼び出し時に Authorization ヘッダーが付与されるようにする。
// - login()／logout() はそれぞれ /auth/login・/auth/logout を呼び、状態を更新する。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, authApi, setAuthTokenGetter } from '../api';
import type { UserProfile } from '../types';
import { clearStoredToken, getStoredToken, storeToken } from './cognito';

/**
 * useAuth() が公開する認証コンテキストの形状。
 */
export interface AuthContextValue {
  /** ログイン中ユーザーのプロフィール。未認証時は null。 */
  user: UserProfile | null;
  /** 認証済みかどうか（トークンとプロフィールの双方が揃っている状態）。 */
  isAuthenticated: boolean;
  /** 初期ハイドレート中・ログイン処理中などのローディング状態。 */
  isLoading: boolean;
  /** メール／パスワードでログインする（要件 1.2）。失敗時は ApiError を送出する。 */
  login: (email: string, password: string) => Promise<void>;
  /** ログアウトする（要件 1.7）。トークンとユーザーを破棄する。 */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * 認証状態プロバイダ。アプリ全体を包み、子孫に認証コンテキストを供給する。
 * 注意: 本コンポーネントは Router 配下（BrowserRouter の内側）に配置する。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // アクセストークン（localStorage と同期）。
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  // ログイン中ユーザーのプロフィール。
  const [user, setUser] = useState<UserProfile | null>(null);
  // 初期ハイドレートやログイン／ログアウト処理中を示すローディング状態。
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // api クライアントのトークンプロバイダから最新トークンを参照するための ref。
  // setAuthTokenGetter に渡す関数が常に最新値を返せるよう、state を ref にミラーする。
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;

  // api クライアントへトークンプロバイダを一度だけ注入する。
  // 以降の get/post/put では Authorization: Bearer <token> が自動付与される。
  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
  }, []);

  // マウント時のハイドレート: トークンがあれば /auth/me でプロフィールを復元する。
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const stored = getStoredToken();
      if (!stored) {
        // 未ログイン。ローディングを解除するだけ。
        if (!cancelled) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const profile = await authApi.getMe();
        if (!cancelled) {
          setUser(profile);
        }
      } catch (error) {
        // 401 の場合はトークン失効／無効とみなして破棄する（要件 1.6）。
        // それ以外のエラーでも安全側に倒し、認証状態はクリアする。
        if (error instanceof ApiError && error.statusCode === 401) {
          clearStoredToken();
          if (!cancelled) {
            setToken(null);
            setUser(null);
          }
        } else {
          clearStoredToken();
          if (!cancelled) {
            setToken(null);
            setUser(null);
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // ログイン処理: /auth/login → トークン保存 → /auth/me でプロフィール取得（要件 1.2）。
  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const result = await authApi.login({ email, password });
      // 先にトークンを保存・反映し、getMe が Authorization を付与できるようにする。
      storeToken(result.accessToken);
      tokenRef.current = result.accessToken;
      setToken(result.accessToken);

      const profile = await authApi.getMe();
      setUser(profile);
    } catch (error) {
      // 失敗時は中途半端な状態を残さないよう破棄し、呼び出し側（LoginPage）へ送出する。
      clearStoredToken();
      tokenRef.current = null;
      setToken(null);
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ログアウト処理: /auth/logout を呼びトークンとユーザーを破棄する（要件 1.7）。
  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch {
      // ログアウト API が失敗してもローカル状態は必ずクリアする。
    } finally {
      clearStoredToken();
      tokenRef.current = null;
      setToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(token && user),
      isLoading,
      login,
      logout,
    }),
    [user, token, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 認証コンテキストを参照するフック。AuthProvider の外で使うとエラーを投げる。
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth は AuthProvider の内側で使用してください。');
  }
  return context;
}
