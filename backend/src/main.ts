import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * アプリケーションのブートストラップ。
 * NestJS アプリを生成し、共通設定（グローバルプレフィックス・CORS・バリデーション）を
 * 適用したうえで HTTP サーバーを起動する。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // すべての REST エンドポイントに共通プレフィックス `/api` を付与する
  app.setGlobalPrefix('api');

  // フロントエンド（Vite 開発サーバー）からのクロスオリジンアクセスを許可する
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // DTO の入力検証を全体で有効化する。未定義プロパティは除去する。
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 待受ポート（docker-compose.yml では 3000 を公開する）
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

// ブートストラップ失敗時はプロセスを異常終了させる
void bootstrap();
