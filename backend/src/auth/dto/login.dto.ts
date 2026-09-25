import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * POST /auth/login のリクエスト DTO。
 *
 * class-validator により、グローバル ValidationPipe（main.ts）で入力検証を行う。
 * - email: メールアドレス形式であること
 * - password: 空でない文字列であること
 *
 * ログインでは資格情報の照合を AuthService（bcrypt）が担うため、本 DTO では
 * 形式レベルの検証のみを行い、パスワード強度は検証しない（強度は登録時に検証する）。
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
