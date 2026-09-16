import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * POST /auth/login のリクエスト DTO。
 *
 * class-validator により、グローバル ValidationPipe（main.ts）で入力検証を行う。
 * - email: メールアドレス形式であること
 * - password: 空でない文字列であること
 *
 * 認証そのもの（資格情報の照合）は AWS Cognito が担うため、本 DTO では
 * 形式レベルの検証のみを行い、パスワード強度などは検証しない（要件 1.2）。
 */
export class LoginDto {
  /** ログインに用いるメールアドレス */
  @IsEmail({}, { message: '有効なメールアドレスを入力してください。' })
  @IsNotEmpty({ message: 'メールアドレスを入力してください。' })
  email!: string;

  /** ログインに用いるパスワード */
  @IsString()
  @IsNotEmpty({ message: 'パスワードを入力してください。' })
  password!: string;
}
