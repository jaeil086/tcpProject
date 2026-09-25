import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService, UserProfile } from '../users/users.service';
import { UserRole } from '../entities/enums';
import { JwtTokenService } from '../common/auth/jwt-token.service';
import { LoginResponse } from './dto/login-response.dto';

/** bcrypt のソルトラウンド数。 */
const BCRYPT_SALT_ROUNDS = 10;

/**
 * 認証（自前管理：bcrypt + 自己発行 JWT）を担うサービス。
 *
 * 責務:
 * - 新規登録: メール重複を拒否し、パスワードを bcrypt でハッシュ化してユーザーを作成する。
 *   ロールは employee、所属チームは null で作成する。
 * - ログイン: メールでユーザーを引き当て、bcrypt でパスワードを照合し、成功時に JWT を発行する。
 * - ログアウト: ステートレス JWT のため、実質的な失効はクライアント側のトークン破棄で成立する。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  /**
   * 新規ユーザーを登録する（誰でも登録可能）。
   * メールアドレスが既に存在する場合は 409（ConflictException）で拒否する。
   * 成功時はパスワードハッシュを含まないプロフィールを返す。
   *
   * @param email メールアドレス
   * @param password 平文パスワード（DTO で 8 文字以上を検証済み）
   * @param name 氏名
   */
  async register(
    email: string,
    password: string,
    name: string,
  ): Promise<UserProfile> {
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException(
        'このメールアドレスは既に登録されています。',
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = await this.usersService.createUser({
      email,
      name,
      passwordHash,
      role: UserRole.Employee,
    });

    // パスワードハッシュを含めないプロフィールとして返す。
    return this.usersService.getProfile(user);
  }

  /**
   * メールアドレス／パスワードで認証し、成功時に自己発行 JWT を返す。
   * ユーザーが存在しない、またはパスワード照合に失敗した場合は 401 とする。
   * （どちらの理由でも同一メッセージとし、アカウント存在の推測を防ぐ。）
   *
   * @param email メールアドレス
   * @param password 平文パスワード
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) {
      this.logger.warn(`ログイン失敗（該当ユーザーなし）: ${email}`);
      throw new UnauthorizedException(
        'メールアドレスまたはパスワードが正しくありません。',
      );
    }

    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) {
      this.logger.warn(`ログイン失敗（パスワード不一致）: ${email}`);
      throw new UnauthorizedException(
        'メールアドレスまたはパスワードが正しくありません。',
      );
    }

    // ログイン時点の DB ロールをトークンへ埋め込む（以後の認可判定に用いる）。
    const issued = this.jwtTokenService.issueToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken: issued.accessToken,
      tokenType: issued.tokenType,
      expiresIn: issued.expiresIn,
    };
  }

  /**
   * ログアウト処理。
   *
   * 自己発行 JWT はステートレスなため、サーバー側での失効管理は行わない。
   * ログアウトはクライアントがトークンを破棄することで成立する（no-op）。
   * 将来的にトークン失効リスト（ブラックリスト）を導入する場合はここで扱う。
   */
  async logout(): Promise<void> {
    // ステートレス JWT のためサーバー側処理は不要。
    return;
  }
}
