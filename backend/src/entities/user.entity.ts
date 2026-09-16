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
 * Cognito のサブジェクト識別子（cognitoSub）を介して認証基盤と 1:1 で紐付く（要件 1）。
 */
@Entity({ name: 'user' })
export class User {
  /** 主キー（UUID） */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Cognito のサブジェクト識別子（一意） */
  @Column({ name: 'cognito_sub', type: 'varchar', length: 255, unique: true })
  cognitoSub: string;

  /** メールアドレス（一意） */
  @Column({ name: 'email', type: 'varchar', length: 255, unique: true })
  email: string;

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
