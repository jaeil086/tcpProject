import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Team } from '../entities/team.entity';
import { UserRole } from '../entities/enums';

/**
 * ユーザープロフィール（GET /auth/me などで返却する値オブジェクト）。
 * ロール・所属チームを含み、DB 上の実データに基づく。
 */
export interface UserProfile {
  /** アプリ内ユーザー ID（UUID） */
  id: string;
  /** 旧 Cognito のサブジェクト識別子（自前認証方式では null になり得る） */
  cognitoSub: string | null;
  /** メールアドレス */
  email: string;
  /** 氏名 */
  name: string;
  /** ロール（employee / administrator） */
  role: UserRole;
  /** 所属チーム ID（未所属の場合は null） */
  teamId: string | null;
  /** 所属チーム名（未所属または未解決の場合は null） */
  teamName: string | null;
}

/**
 * 管理者向けユーザー一覧・更新 API で返す軽量ビュー。
 * パスワードハッシュや Cognito 情報など機微・不要な項目は含めない。
 */
export interface AdminUserView {
  /** アプリ内ユーザー ID（UUID） */
  id: string;
  /** メールアドレス */
  email: string;
  /** 氏名 */
  name: string;
  /** ロール（employee / administrator） */
  role: UserRole;
  /** 所属チーム ID（未所属の場合は null） */
  teamId: string | null;
  /** 所属チーム名（未所属または未解決の場合は null） */
  teamName: string | null;
}

/** 新規ユーザー作成時の入力。 */
export interface CreateUserInput {
  /** メールアドレス（一意） */
  email: string;
  /** 氏名 */
  name: string;
  /** bcrypt でハッシュ化済みのパスワード */
  passwordHash: string;
  /** ロール（省略時は employee） */
  role?: UserRole;
}

/**
 * ユーザー情報の照会・作成を担うサービス。
 *
 * 責務:
 * - メールアドレス／ユーザー ID によるユーザー解決
 * - 新規ユーザーの作成（自前認証方式での登録）
 * - プロフィール（ロール・所属チームを含む）の組み立て
 *
 * 本サービスは HTTP エンドポイントを持たず、AuthModule や他モジュールから DI で利用される。
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
  ) {}

  /**
   * メールアドレスからアプリユーザーを解決する（ログイン・重複チェックで利用）。
   * 存在しない場合は null を返す。所属チームも併せて取得する。
   *
   * @param email メールアドレス
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: { team: true },
    });
  }

  /**
   * ユーザー ID（UUID）からアプリユーザーを解決する。
   * 存在しない場合は null を返す。
   *
   * @param id User.id（UUID）
   */
  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: { team: true },
    });
  }

  /**
   * 新規ユーザーを作成して保存する（自前認証方式での登録。要件: 誰でも登録可能）。
   * ロールは既定で employee、所属チームは null（未所属）とする。
   * パスワードは呼び出し側で bcrypt ハッシュ化済みの値を渡すこと。
   *
   * @param input email / name / passwordHash / role（任意）
   */
  async createUser(input: CreateUserInput): Promise<User> {
    const user = this.userRepository.create({
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      role: input.role ?? UserRole.Employee,
      // 自前認証では Cognito を利用しないため null 固定
      cognitoSub: null,
      teamId: null,
    });
    return this.userRepository.save(user);
  }

  /**
   * ユーザーエンティティからプロフィール（ロール・所属チームを含む）を組み立てる。
   * チームリレーションが読み込まれていない場合でも teamId から ID は返却でき、
   * チーム名はリレーションが解決済みのときのみ設定する。
   *
   * @param user 対象ユーザー
   */
  getProfile(user: User): UserProfile {
    return {
      id: user.id,
      cognitoSub: user.cognitoSub ?? null,
      email: user.email,
      name: user.name,
      role: user.role,
      teamId: user.teamId ?? null,
      teamName: user.team?.name ?? null,
    };
  }

  /**
   * ユーザーエンティティから管理者向けビュー（AdminUserView）を組み立てる。
   * パスワードハッシュ等の機微情報は含めない。チーム名はリレーション解決時のみ設定する。
   *
   * @param user 対象ユーザー
   */
  toAdminUserView(user: User): AdminUserView {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      teamId: user.teamId ?? null,
      teamName: user.team?.name ?? null,
    };
  }

  /**
   * すべてのユーザーを管理者向けビューの配列として返す（GET /users）。
   * 所属チームを join してチーム名を解決し、氏名の昇順で並べる。
   * パスワードハッシュは含めない。
   */
  async listUsers(): Promise<AdminUserView[]> {
    const users = await this.userRepository.find({
      relations: { team: true },
      order: { name: 'ASC' },
    });
    return users.map((user) => this.toAdminUserView(user));
  }

  /**
   * 指定ユーザーの所属チームを割り当て／解除する（PUT /users/:id/team）。
   * teamId が null の場合は未所属にする。null 以外の場合は該当チームの存在を検証し、
   * 存在しなければ 400（BadRequestException）とする。ユーザーが存在しない場合は 404。
   *
   * @param userId 対象ユーザーの id
   * @param teamId 割り当てるチーム id（null で未所属化）
   */
  async assignTeam(
    userId: string,
    teamId: string | null,
  ): Promise<AdminUserView> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { team: true },
    });
    if (!user) {
      throw new NotFoundException('指定されたユーザーが見つかりません。');
    }

    if (teamId === null) {
      // 未所属化する。
      user.teamId = null;
      user.team = null;
    } else {
      const team = await this.teamRepository.findOne({ where: { id: teamId } });
      if (!team) {
        throw new BadRequestException('指定されたチームが存在しません。');
      }
      user.teamId = team.id;
      user.team = team;
    }

    const saved = await this.userRepository.save(user);
    return this.toAdminUserView(saved);
  }

  /**
   * 指定ユーザーのロールを変更する（PUT /users/:id/role）。
   * ユーザーが存在しない場合は 404（NotFoundException）とする。
   *
   * @param userId 対象ユーザーの id
   * @param role 変更後のロール
   */
  async updateRole(userId: string, role: UserRole): Promise<AdminUserView> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { team: true },
    });
    if (!user) {
      throw new NotFoundException('指定されたユーザーが見つかりません。');
    }

    user.role = role;
    const saved = await this.userRepository.save(user);
    return this.toAdminUserView(saved);
  }
}
