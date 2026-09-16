import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Team } from '../entities/team.entity';
import { User } from '../entities/user.entity';

/**
 * チーム情報の照会を担うサービス。
 *
 * 責務（設計書 TeamsModule）:
 * - チーム一覧の取得（カレンダーのチーム選択用。要件 3.3、GET /teams）
 * - チーム別メンバーの取得（カレンダー集約のチームフィルタで利用。要件 3.3、3.4、タスク 8）
 */
@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * すべてのチームを名前昇順で返す（要件 3.3、GET /teams）。
   */
  async listTeams(): Promise<Team[]> {
    return this.teamRepository.find({
      order: { name: 'ASC' },
    });
  }

  /**
   * 指定チームに所属するメンバー（ユーザー）を返す（要件 3.3、3.4）。
   * カレンダー集約（タスク 8）のチームフィルタで、選択チームの所属メンバーのみを
   * 取得するために利用する。
   *
   * @param teamId 対象チームの ID（Team.id）
   */
  async getMembersByTeam(teamId: string): Promise<User[]> {
    return this.userRepository.find({
      where: { teamId },
      order: { name: 'ASC' },
    });
  }
}
