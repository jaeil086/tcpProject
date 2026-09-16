import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import './index.css';

// React アプリケーションのエントリポイント
// #root 要素に App をマウントする。
// AuthProvider は Router フック（useNavigate/useLocation）を用いる可能性があるため、
// 必ず BrowserRouter の内側に配置する。
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('ルート要素（#root）が見つかりません。');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
