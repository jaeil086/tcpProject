import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserRole } from './enums';
import { Team } from './team.entity';

/**
 * ユーザー（従業員）エンティティ。
 *
 * 認証は自前管理方式（bcrypt によるパスワードハッシュ + 自己発行 JWT）で行う。
 * パスワードのハッシュ値は passwordHash に保持し、認証時に bcrypt で照合する。
 *
 * cognitoSub は旧 Cognito 連携時代の識別子で、既存データとの後方互換のために
 * カラムを残すが、新方式では利用しないため NULL 許容とする（新規ユーザーでは常に NULL）。
 */
@Entity({ name: 'user' })
export class User {
  /** 主キー（UUID） */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 旧 Cognito のサブジェクト識別子（後方互換のため保持。新方式では未使用のため NULL 許容）。
   * 既存行には値が入っている可能性があるため、一意制約は維持する。
   */
  @Column({
    name: 'cognito_sub',
    type: 'varchar',
    length: 255,
    unique: true,
    nullable: true,
  })
  cognitoSub: string | null;

  /** メールアドレス（一意。ログイン識別子として利用する） */
  @Column({ name: 'email', type: 'varchar', length: 255, unique: true })
  email: string;

  /**
   * パスワードのハッシュ値（bcrypt）。
   * 既存行を壊さないため NULL 許容とするが、新規登録ユーザーでは必ず設定する。
   */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  passwordHash: string | null;

  /** 氏名 */
  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  /** ロール（employee / administrator） */
  @Column({ name: 'role', type: 'enum', enum: UserRole })
  role: UserRole;

  /** 所属チームの外部キー（未所属の場合は NULL） */
  @Column({ name: 'team_id', type: 'uuid', nullable: true })
  teamId: string | null;

  /** 所属チームへのリレーション（多ユーザー : 1 チーム） */
  @ManyToOne(() => Team, (team) => team.users, { nullable: true })
  @JoinColumn({ name: 'team_id' })
  team: Team | null;
}
