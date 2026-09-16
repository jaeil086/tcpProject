# AI Team Planner フロントエンド（React + Vite）用 Dockerfile
# docker-compose.yml でソースをバインドマウントし、ホットリロード可能な
# 開発サーバー（Vite dev server）として起動する構成とする。

FROM node:20-alpine

WORKDIR /app

# 依存関係の定義のみを先にコピーしてキャッシュを効かせる
COPY package*.json ./

# 全依存をインストール（開発サーバー起動に必要）
RUN npm install

# ソースをコピー（開発時は docker-compose のバインドマウントで上書きされる）
COPY . .

# Vite の既定ポート（docker-compose.yml と一致）
EXPOSE 5173

# 0.0.0.0 で待ち受け、コンテナ外部からアクセスできるようにする
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
