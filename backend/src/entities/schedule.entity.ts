import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { WorkLocation } from './enums';
import { User } from './user.entity';

/**
 * 勤務予定エンティティ。
 * 「ユーザー × 日付」で一意となり、同一ユーザーが同一日に複数の勤務区分を
 * 持たないことを DB レベルで保証する（要件 2.7）。
 *
 * 複合一意制約 (user_id, date) と date インデックスはマイグレーション（タスク 3.2）で
 * 正式に作成するが、エンティティ上にも宣言してスキーマ意図を明示・一貫させる。
 */
@Entity({ name: 'schedule' })
@Unique('uq_schedule_user_date', ['userId', 'date'])
@Index('idx_schedule_date', ['date'])
export class Schedule {
  /** 主キー（UUID） */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 従業員（User.id）への外部キー */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** 対象日（YYYY-MM-DD） */
  @Column({ name: 'date', type: 'date' })
  date: string;

  /** 勤務区分（office / remote） */
  @Column({ name: 'work_location', type: 'enum', enum: WorkLocation })
  workLocation: WorkLocation;

  /** 作成日時 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 更新日時 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** 予定を登録した従業員へのリレーション（多予定 : 1 ユーザー） */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
