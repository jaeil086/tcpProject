import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './auth';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './features/login/LoginPage';
import { RegisterPage } from './features/register/RegisterPage';
import { ScheduleEditor } from './features/schedule/ScheduleEditor';
import { TeamCalendar } from './features/calendar/TeamCalendar';
import { AdminDashboard } from './features/dashboard/AdminDashboard';
import { AnalysisPanel } from './features/analysis/AnalysisPanel';
import { UserManagement } from './features/admin/UserManagement';
import { UserRole } from './types';

// ルーティング定義
// 認証状態管理は AuthProvider（main.tsx で BrowserRouter の内側に配置）が担う。
// 認証済み画面は AppLayout（共通ヘッダー・ナビ）配下のレイアウトルートに集約し、
// <Outlet/> に各機能画面を描画する。ログイン画面は公開ルートとしてレイアウト外に置く。

function App() {
  return (
    <Routes>
      {/* ログイン画面（公開ルート。共通ナビは表示しない） */}
      <Route path="/login" element={<LoginPage />} />

      {/* 新規登録画面（公開ルート。共通ナビは表示しない） */}
      <Route path="/register" element={<RegisterPage />} />

      {/* 認証済み画面の共通レイアウト（要認証・全ロール） */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        {/* ホーム（チームカレンダー）: 全ロール */}
        <Route path="/" element={<TeamCalendar />} />

        {/* 勤務予定登録・更新: 全ロール */}
        <Route path="/schedule" element={<ScheduleEditor />} />

        {/* 管理者ダッシュボード: 管理者専用（要件 4.2） */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute requiredRole={UserRole.Administrator}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* AI 分析パネル: 管理者専用（要件 4.2） */}
        <Route
          path="/analysis"
          element={
            <ProtectedRoute requiredRole={UserRole.Administrator}>
              <AnalysisPanel />
            </ProtectedRoute>
          }
        />

        {/* ユーザー管理: 管理者専用 */}
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute requiredRole={UserRole.Administrator}>
              <UserManagement />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
