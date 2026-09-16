// Feature: ai-team-planner
// 認証が必要なルートを保護するラッパーコンポーネント（要件 1.1、1.6、4.2）。
//
// 設計方針:
// - 未認証（有効なトークン／プロフィールなし）の場合はログイン画面へリダイレクトする。
//   その際、react-router の Navigate に state={{ from: location }} を付与して
//   元のアクセス先を保持し、ログイン後に元の画面へ戻れるようにする（要件 1.1、1.6）。
// - requiredRole を指定した場合はロールを検証し、権限不足なら権限不足メッセージを表示する
//   （要件 4.2。管理者専用のダッシュボード／分析画面に適用）。
// - 初期ハイドレート中（isLoading）は軽量なローディング表示を返す。

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import type { UserRole } from '../types';

interface ProtectedRouteProps {
  /** 保護対象の子要素（画面コンポーネント）。 */
  children: ReactNode;
  /** 必要なロール。指定時は当該ロールのユーザーのみ許可する（要件 4.2）。 */
  requiredRole?: UserRole;
}

/**
 * 認証・認可を満たす場合のみ children を描画する保護ルート。
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // ハイドレート中はリダイレクト判断を保留し、軽量なローディングを表示する。
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        <p>読み込み中...</p>
      </div>
    );
  }

  // 未認証／トークン失効時は元アクセス先を保持してログイン画面へ（要件 1.1、1.6）。
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // ロール要件がある場合の認可チェック（要件 4.2）。
  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-4 text-center">
        <h1 className="text-xl font-bold text-gray-800">アクセス権限がありません</h1>
        <p className="text-gray-500">この画面を表示する権限がありません。管理者にお問い合わせください。</p>
      </div>
    );
  }

  return <>{children}</>;
}
