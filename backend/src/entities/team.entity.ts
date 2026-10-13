import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * チームエンティティ。
 * 従業員（User）が所属する組織単位を表す（要件 3.3）。
 *
 * leader はチームを作成した管理者（チームリーダー）を指す。
 * チーム作成時に作成者の id を記録し、GET /teams でリーダー情報として返す。
 * 既存データとの後方互換のため NULL 許容とする。
 */
@Entity({ name: 'team' })
export class Team {
  /** 主キー（UUID） */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** チーム名 */
  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  /** チームリーダー（作成者）の外部キー（未設定の場合は NULL） */
  @Column({ name: 'leader_id', type: 'uuid', nullable: true })
  leaderId: string | null;

  /** チームリーダー（作成者）へのリレーション（多チーム : 1 ユーザー、逆参照なし） */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'leader_id' })
  leader: User | null;

  /** このチームに所属するユーザー群（1 チーム : 多ユーザー） */
  @OneToMany(() => User, (user) => user.team)
  users: User[];
}
