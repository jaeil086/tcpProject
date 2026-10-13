import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Team } from '../entities/team.entity';
import { User } from '../entities/user.entity';

/**
 * API（GET/POST /teams）がクライアントへ返すチームのビュー型。
 * エンティティそのものではなく、リーダー情報を平坦化して公開する。
 */
export interface TeamSummary {
  /** チーム id（UUID） */
  id: string;
  /** チーム名 */
  name: string;
  /** チームリーダー（作成者）の id。未設定なら null */
  leaderId: string | null;
  /** チームリーダー（作成者）の氏名。未設定なら null */
  leaderName: string | null;
}

/**
 * チーム情報の照会・作成を担うサービス。
 *
 * 責務（設計書 TeamsModule）:
 * - チーム一覧の取得（カレンダーのチーム選択用。要件 3.3、GET /teams）
 * - チーム別メンバーの取得（カレンダー集約のチームフィルタで利用。要件 3.3、3.4、タスク 8）
 * - チームの新規作成（管理者のみ。作成者をリーダーとして記録。POST /teams）
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
   * すべてのチームを名前昇順で、リーダー情報付きで返す（要件 3.3、GET /teams）。
   * リーダー未設定のチームは leaderId / leaderName とも null となる。
   */
  async listTeams(): Promise<TeamSummary[]> {
    const teams = await this.teamRepository.find({
      relations: { leader: true },
      order: { name: 'ASC' },
    });
    return teams.map((team) => this.toSummary(team));
  }

  /**
   * チームを新規作成し、作成者をリーダーとして記録する（POST /teams、管理者のみ）。
   *
   * - name は前後空白を除去し、空文字なら 400（BadRequestException）とする。
   * - 同名チームが既に存在する場合は 409（ConflictException）とする。
   * - 作成後はリーダー情報付きの TeamSummary を返す。
   *
   * @param name チーム名（未トリム可）
   * @param leaderUserId チームリーダーとなる作成者（管理者）のユーザー id
   */
  async createTeam(
    name: string,
    leaderUserId: string,
  ): Promise<TeamSummary> {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      throw new BadRequestException('チーム名を入力してください。');
    }

    const duplicate = await this.teamRepository.findOne({
      where: { name: trimmedName },
    });
    if (duplicate) {
      throw new ConflictException('同名のチームが既に存在します。');
    }

    const created = await this.teamRepository.save(
      this.teamRepository.create({
        name: trimmedName,
        leaderId: leaderUserId,
      }),
    );

    // 作成直後の値を基に、リーダー氏名を解決して TeamSummary を組み立てる。
    const leader = await this.userRepository.findOne({
      where: { id: leaderUserId },
    });

    return {
      id: created.id,
      name: created.name,
      leaderId: created.leaderId,
      leaderName: leader?.name ?? null,
    };
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

  /**
   * Team エンティティ（leader リレーション込み）を API 公開用の TeamSummary へ変換する。
   */
  private toSummary(team: Team): TeamSummary {
    return {
      id: team.id,
      name: team.name,
      leaderId: team.leaderId,
      leaderName: team.leader?.name ?? null,
    };
  }
}
