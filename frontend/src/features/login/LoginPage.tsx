// Feature: ai-team-planner
// ログイン画面（要件 1.2〜1.5）。
//
// 設計方針:
// - メールアドレス／パスワードの入力フォームを表示し、送信時に useAuth().login() を呼ぶ。
// - 成功時は保持していた元アクセス先（location.state.from）へ、無ければ '/' へ遷移する
//   （要件 1.1 と連動: ProtectedRoute が保存した from を復元）。
// - 失敗時は ApiError の statusCode を日本語メッセージへマッピングして表示する。
//     401 → 認証失敗（メール／パスワード不一致、要件 1.3）
//     423 → アカウント一時ロック（要件 1.4）
//     503 → 一時的に認証不可（要件 1.5）
//     その他 → 汎用エラーメッセージ
// - 送信処理中は二重送信を防ぐためボタンを無効化する。

import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api';
import { useAuth } from '../../auth';

/** location.state に格納される「元アクセス先」の形状。 */
interface LocationState {
  from?: { pathname?: string };
}

/**
 * ApiError（またはその他の例外）をユーザー向け日本語メッセージへ変換する。
 */
function toLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.statusCode) {
      case 401:
        // 要件 1.3: 資格情報不一致・未登録。
        return 'メールアドレスまたはパスワードが正しくありません。';
      case 423:
        // 要件 1.4: 連続失敗によるアカウント一時ロック。
        return 'ログインの失敗が続いたため、アカウントを一時的にロックしました。15分ほど待ってから再度お試しください。';
      case 503:
        // 要件 1.5: 認証基盤の障害。
        return '現在、一時的に認証できません。しばらくしてから再度お試しください。';
      default:
        return 'ログインに失敗しました。時間をおいて再度お試しください。';
    }
  }
  // ネットワークエラーなど ApiError 以外。
  return 'ログインに失敗しました。時間をおいて再度お試しください。';
}

/**
 * ログイン画面コンポーネント。
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ログイン後に戻る先。ProtectedRoute が state.from に元アクセス先を保存している。
  const state = location.state as LocationState | null;
  const redirectTo = state?.from?.pathname ?? '/';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      // 成功時は元アクセス先（または '/'）へ遷移する。
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrorMessage(toLoginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-800">AI Team Planner</h1>

        {/* エラーメッセージ表示領域（認証失敗・ロックアウト・障害） */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isSubmitting ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        {/* 新規登録画面への導線 */}
        <p className="mt-6 text-center text-sm text-gray-600">
          アカウントをお持ちでない方は{' '}
          <Link to="/register" className="font-medium text-blue-600 hover:underline">
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
