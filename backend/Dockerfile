# AI Team Planner バックエンド（NestJS）用 Dockerfile
# マルチステージビルドで、ビルドと実行環境を分離する。

# ---- ビルドステージ ----
FROM node:20-alpine AS builder

WORKDIR /app

# 依存関係の定義のみを先にコピーしてキャッシュを効かせる
COPY package*.json ./

# devDependencies を含めて全依存をインストール（ビルドに必要）
RUN npm install

# ソースをコピーしてビルド
COPY . .
RUN npm run build

# ---- 実行ステージ ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 本番依存のみをインストール
COPY package*.json ./
RUN npm install --omit=dev

# ビルド成果物をコピー
COPY --from=builder /app/dist ./dist

# NestJS の既定ポート（docker-compose.yml と一致）
EXPOSE 3000

CMD ["node", "dist/main.js"]
