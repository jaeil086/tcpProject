import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * POST /auth/register のリクエスト DTO。
 *
 * class-validator により、グローバル ValidationPipe（main.ts）で入力検証を行う。
 * - email: メールアドレス形式であること
 * - password: 8 文字以上であること（パスワードポリシー）
 * - name: 空でないこと
 */
export class RegisterDto {
  /** 登録に用いるメールアドレス */
  @IsEmail({}, { message: '有効なメールアドレスを入力してください。' })
  @IsNotEmpty({ message: 'メールアドレスを入力してください。' })
  email!: string;

  /** 登録に用いるパスワード（8 文字以上） */
  @IsString()
  @MinLength(8, { message: 'パスワードは 8 文字以上で入力してください。' })
  password!: string;

  /** 氏名 */
  @IsString()
  @IsNotEmpty({ message: '氏名を入力してください。' })
  name!: string;
}
