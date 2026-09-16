import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode, ErrorResponse } from '../errors/error-response';

/**
 * 全例外を捕捉し、統一エラー応答（ErrorResponse）へ変換するグローバル例外フィルタ。
 *
 * - HttpException（NestJS の例外）は、その HTTP ステータスに応じて errorCode と
 *   日本語メッセージへマッピングする。
 * - それ以外の未知の例外は 500（INTERNAL_ERROR）として扱い、詳細はログにのみ記録して
 *   クライアントには汎用メッセージのみ返す（内部情報の漏洩を防ぐ）。
 *
 * フロントエンドは errorCode を解釈して画面遷移やメッセージ表示を行う（設計書 Error Handling）。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { statusCode, errorCode, message } = this.resolveError(exception);

    // 5xx（サーバー側の問題）は原因調査のためログに残す
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `未処理の例外が発生しました (status=${statusCode})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponse = { statusCode, errorCode, message };
    response.status(statusCode).json(body);
  }

  /**
   * 例外を統一エラー応答の各フィールドへ変換する。
   */
  private resolveError(exception: unknown): ErrorResponse {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      return {
        statusCode,
        errorCode: this.mapErrorCode(statusCode),
        message: this.mapMessage(statusCode, exception),
      };
    }

    // HttpException 以外は想定外のサーバーエラーとして扱う
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ErrorCode.INTERNAL_ERROR,
      message: 'サーバー内部でエラーが発生しました。時間をおいて再度お試しください。',
    };
  }

  /**
   * HTTP ステータスコードからアプリ固有のエラーコードを導出する。
   */
  private mapErrorCode(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      default:
        return statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
          ? ErrorCode.INTERNAL_ERROR
          : ErrorCode.BAD_REQUEST;
    }
  }

  /**
   * ユーザー向けの日本語メッセージを導出する。
   *
   * 例外が明示的なメッセージ（文字列）を持つ場合はそれを尊重し、
   * 持たない場合はステータスコードに応じた既定の日本語メッセージを返す。
   */
  private mapMessage(statusCode: number, exception: HttpException): string {
    const explicit = this.extractExplicitMessage(exception);
    if (explicit) {
      return explicit;
    }

    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return '入力内容が正しくありません。';
      case HttpStatus.UNAUTHORIZED:
        return '認証が必要です。ログインしてください。';
      case HttpStatus.FORBIDDEN:
        return 'この操作を行う権限がありません。';
      case HttpStatus.NOT_FOUND:
        return '対象のリソースが見つかりません。';
      default:
        return 'エラーが発生しました。';
    }
  }

  /**
   * HttpException のレスポンス本文から明示的なメッセージを取り出す。
   * ClassValidator の配列メッセージは先頭要素を代表として用いる。
   */
  private extractExplicitMessage(exception: HttpException): string | null {
    const res = exception.getResponse();

    if (typeof res === 'string') {
      return res;
    }

    if (res && typeof res === 'object') {
      const message = (res as { message?: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message) && message.length > 0) {
        return String(message[0]);
      }
    }

    return null;
  }
}
