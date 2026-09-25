// Feature: ai-team-planner
// 新規登録画面（自己管理型認証）。
//
// 設計方針:
// - メールアドレス／パスワード（8 文字以上）／氏名の入力フォームを表示し、送信時に
//   useAuth().register() を呼ぶ。register は登録後に自動ログインまで行う。
// - 成功時はホーム（'/'）へ遷移する。
// - 失敗時は ApiError の statusCode を日本語メッセージへマッピングして表示する。
//     409 → メールアドレス重複
//     400 → 入力内容不正（サーバーの日本語メッセージがあれば優先）
//     その他 → 汎用エラーメッセージ
// - 送信処理中は二重送信を防ぐためボタンを無効化する。
// - デザインは LoginPage と一貫させる（Tailwind）。

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api';
import { useAuth } from '../../auth';

/** パスワードの最小文字数（バックエンドのバリデーションと整合させる）。 */
const PASSWORD_MIN_LENGTH = 8;

/**
 * ApiError（またはその他の例外）をユーザー向け日本語メッセージへ変換する。
 */
function toRegisterErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.statusCode) {
      case 409:
        // メールアドレス重複。
        return 'このメールアドレスは既に登録されています。';
      case 400:
        // 入力内容不正。サーバーの日本語メッセージがあれば優先する。
        return error.message || '入力内容を確認してください。';
      default:
        return '登録に失敗しました。時間をおいて再度お試しください。';
    }
  }
  // ネットワークエラーなど ApiError 以外。
  return '登録に失敗しました。時間をおいて再度お試しください。';
}

/**
 * 新規登録画面コンポーネント。
 */
export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    // クライアント側でもパスワード長を確認し、無駄な往復を避ける。
    if (password.length < PASSWORD_MIN_LENGTH) {
      setErrorMessage(`パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください。`);
      return;
    }

    setIsSubmitting(true);
    try {
      await register(email, password, name);
      // 登録＋自動ログイン成功時はホームへ遷移する。
      navigate('/', { replace: true });
    } catch (error) {
      setErrorMessage(toRegisterErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-800">新規登録</h1>

        {/* エラーメッセージ表示領域（重複・入力不正・障害） */}
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
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
              氏名
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

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
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            />
            {/* パスワード要件のヒント */}
            <p className="mt-1 text-xs text-gray-500">
              {PASSWORD_MIN_LENGTH}文字以上で入力してください。
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isSubmitting ? '登録中...' : '登録'}
          </button>
        </form>

        {/* ログイン画面への導線 */}
        <p className="mt-6 text-center text-sm text-gray-600">
          既にアカウントをお持ちの方は{' '}
          <Link to="/login" className="font-medium text-blue-600 hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
