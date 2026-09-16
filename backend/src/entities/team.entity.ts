import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

/**
 * チームエンティティ。
 * 従業員（User）が所属する組織単位を表す（要件 3.3）。
 */
@Entity({ name: 'team' })
export class Team {
  /** 主キー（UUID） */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** チーム名 */
  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  /** このチームに所属するユーザー群（1 チーム : 多ユーザー） */
  @OneToMany(() => User, (user) => user.team)
  users: User[];
}
