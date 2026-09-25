// Feature: ai-team-planner
// 認証済み画面で共有するアプリケーションレイアウト（ヘッダー・ナビゲーション）。
//
// 設計方針:
// - App.tsx のレイアウトルートとして使用し、<Outlet/> に各機能画面を描画する。
//   これにより保護ルート群（/、/schedule、/dashboard、/analysis）で共通のナビを提供する。
// - ナビゲーションリンクは react-router の <NavLink> を用い、現在位置をハイライトする。
// - 管理者専用リンク（ダッシュボード・AI 分析）は useAuth().user?.role が
//   administrator の場合のみ表示する（要件 4.2）。
// - ログアウトボタンは useAuth().logout() を呼び、完了後 /login へ遷移する（要件 1.7）。
// - ログイン画面（/login）は本レイアウトの外側に配置するため、ナビは表示されない。

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { UserRole } from '../types';

/**
 * NavLink の共通クラスを、アクティブ状態に応じて算出する。
 */
function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base = 'rounded px-3 py-2 text-sm font-medium transition-colors';
  return isActive
    ? `${base} bg-blue-600 text-white`
    : `${base} text-gray-700 hover:bg-gray-100`;
}

/**
 * 認証済み画面の共通レイアウト。ヘッダーのナビゲーションと本文（Outlet）を描画する。
 */
export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdministrator = user?.role === UserRole.Administrator;

  // ログアウト処理: 認証状態を破棄してからログイン画面へ遷移する（要件 1.7）。
  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 共通ヘッダー */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          {/* アプリ名 */}
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-gray-900">AI Team Planner</span>

            {/* 主ナビゲーション */}
            <nav className="flex items-center gap-1">
              <NavLink to="/" end className={navLinkClass}>
                チームカレンダー
              </NavLink>
              <NavLink to="/schedule" className={navLinkClass}>
                勤務予定
              </NavLink>
              {/* 管理者専用リンク（要件 4.2） */}
              {isAdministrator && (
                <>
                  <NavLink to="/dashboard" className={navLinkClass}>
                    ダッシュボード
                  </NavLink>
                  <NavLink to="/analysis" className={navLinkClass}>
                    AI 分析
                  </NavLink>
                  <NavLink to="/admin/users" className={navLinkClass}>
                    ユーザー管理
                  </NavLink>
                </>
              )}
            </nav>
          </div>

          {/* ユーザー情報とログアウト */}
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-gray-600 sm:inline">
                {user.name}
                {user.teamName ? `（${user.teamName}）` : ''}
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* 本文（各機能画面を描画） */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
