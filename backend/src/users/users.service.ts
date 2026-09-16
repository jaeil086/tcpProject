import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/enums';

/**
 * ユーザープロフィール（GET /auth/me などで返却する値オブジェクト）。
 * ロール・所属チームを含み、Cognito のクレームではなく DB 上の実データに基づく。
 */
export interface UserProfile {
  /** アプリ内ユーザー ID（UUID） */
  id: string;
  /** Cognito のサブジェクト識別子 */
  cognitoSub: string;
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
 * ユーザー情報の照会を担うサービス。
 *
 * 責務（設計書 UsersModule）:
 * - Cognito のサブジェクト識別子（cognitoSub）とアプリユーザーの紐付け解決
 * - ユーザー ID によるユーザー解決
 * - プロフィール（ロール・所属チームを含む）の組み立て
 *
 * 本サービスは HTTP エンドポイントを持たず、AuthModule（タスク 6.2）や他モジュールから
 * DI で利用される。GET /auth/me のプロフィール返却や、リクエストユーザーへの
 * 実ロール（DB 由来）付与に用いる。
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Cognito のサブジェクト識別子からアプリユーザーを解決する。
   * 紐付くユーザーが存在しない場合は null を返す。
   * 所属チームを併せて取得する（プロフィール解決で利用するため）。
   *
   * @param cognitoSub Cognito のサブジェクト識別子（User.cognitoSub）
   */
  async findByCognitoSub(cognitoSub: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { cognitoSub },
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
   * ユーザーエンティティからプロフィール（ロール・所属チームを含む）を組み立てる。
   * チームリレーションが読み込まれていない場合でも teamId から ID は返却でき、
   * チーム名はリレーションが解決済みのときのみ設定する。
   *
   * @param user 対象ユーザー
   */
  getProfile(user: User): UserProfile {
    return {
      id: user.id,
      cognitoSub: user.cognitoSub,
      email: user.email,
      name: user.name,
      role: user.role,
      teamId: user.teamId ?? null,
      teamName: user.team?.name ?? null,
    };
  }
}
