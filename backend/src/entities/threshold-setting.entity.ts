import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * しきい値設定エンティティ。
 * システム全体で単一レコードとして運用し、出社人員の過不足判定に用いる
 * Upper_Threshold / Lower_Threshold（いずれも 0〜100 の整数）を保持する（要件 4.3、4.4）。
 * 更新のたびに更新者（Administrator）と更新日時を記録する。
 */
@Entity({ name: 'threshold_setting' })
export class ThresholdSetting {
  /** 主キー（UUID） */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 出社上限しきい値（0〜100） */
  @Column({ name: 'upper_threshold', type: 'int' })
  upperThreshold: number;

  /** 出社下限しきい値（0〜100） */
  @Column({ name: 'lower_threshold', type: 'int' })
  lowerThreshold: number;

  /** 更新した Administrator（User.id）への外部キー */
  @Column({ name: 'updated_by', type: 'uuid' })
  updatedBy: string;

  /** 更新者へのリレーション */
  @ManyToOne(() => User)
  @JoinColumn({ name: 'updated_by' })
  updatedByUser: User;

  /** 更新日時 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
