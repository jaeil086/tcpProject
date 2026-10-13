import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * POST /teams のリクエスト DTO。
 *
 * class-validator により、グローバル ValidationPipe（main.ts）で入力検証を行う。
 * - name: 文字列で、空でなく、255 文字以内であること
 */
export class CreateTeamDto {
  /** 作成するチーム名 */
  @IsString({ message: 'チーム名を文字列で入力してください。' })
  @IsNotEmpty({ message: 'チーム名を入力してください。' })
  @MaxLength(255, { message: 'チーム名は 255 文字以内で入力してください。' })
  name!: string;
}
