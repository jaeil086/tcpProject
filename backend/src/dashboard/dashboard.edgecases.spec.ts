import 'reflect-metadata';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Schedule } from '../entities/schedule.entity';
import { User } from '../entities/user.entity';
import { ThresholdSetting } from '../entities/threshold-setting.entity';
import { UserRole } from '../entities/enums';
import { UsersService } from '../users/users.service';
import { DashboardService } from './dashboard.service';

/**
 * ダッシュボードの例示・エッジケーステスト（要件 4.4、4.7）。
 *
 * 目的:
 *  - 指定日に出社登録者が 1 人も存在しない場合、getAttendees が空配列を返すこと
 *    （フロントの「未在席メッセージ」表示の根拠。要件 4.7）を検証する。
 *  - しきい値の不正入力を updateThreshold が拒否（400）し、かつ既存のしきい値設定を
 *    一切変更しない（save が呼ばれない）こと（要件 4.4）を検証する。
 *  - 対照として、妥当なしきい値では保存され、返却値が入力と一致すること（要件 4.3、4.4）を検証する。
 *
 * 実行方針:
 *  - 実 DB を使わず、依存（Schedule / User / ThresholdSetting リポジトリ、UsersService）を
 *    モック化する。これにより環境非依存で常に実行される（スキップされない）。
 */

// 管理者ユーザーのダミーを生成する。
function makeAdmin(cognitoSub: string): User {
  return {
    id: 'admin-id',
    cognitoSub,
    email: 'admin@example.com',
    name: '管理者太郎',
    role: UserRole.Administrator,
    teamId: null,
    team: null,
  } as User;
}

// 既存のしきい値設定のダミーを生成する（不正入力時に保持されるべき既存値）。
function makeExistingSetting(): ThresholdSetting {
  return {
    id: 'threshold-id',
    upperThreshold: 80,
    lowerThreshold: 20,
    updatedBy: 'admin-id',
  } as ThresholdSetting;
}

// モックした依存で DashboardService を組み立てるヘルパー。
function buildService(overrides: {
  scheduleFind?: jest.Mock;
  thresholdFindOne?: jest.Mock;
  thresholdCreate?: jest.Mock;
  thresholdSave?: jest.Mock;
  findByCognitoSub?: jest.Mock;
}): {
  service: DashboardService;
  thresholdSave: jest.Mock;
  thresholdFindOne: jest.Mock;
} {
  const scheduleRepository = {
    find: overrides.scheduleFind ?? jest.fn(),
  } as unknown as Repository<Schedule>;

  const userRepository = {
    findOne: jest.fn(),
  } as unknown as Repository<User>;

  const thresholdSave = overrides.thresholdSave ?? jest.fn();
  const thresholdFindOne = overrides.thresholdFindOne ?? jest.fn();
  const thresholdRepository = {
    findOne: thresholdFindOne,
    create: overrides.thresholdCreate ?? jest.fn(() => ({}) as ThresholdSetting),
    save: thresholdSave,
  } as unknown as Repository<ThresholdSetting>;

  const usersService = {
    findByCognitoSub: overrides.findByCognitoSub ?? jest.fn(),
  } as unknown as UsersService;

  const service = new DashboardService(
    scheduleRepository,
    userRepository,
    thresholdRepository,
    usersService,
  );

  return { service, thresholdSave, thresholdFindOne };
}

describe('ダッシュボードの例示・エッジケーステスト（要件 4.4、4.7）', () => {
  const adminSub = 'dashboard-admin-001';

  // 例示 1: 出社者 0 人（要件 4.7）。
  // 指定日に office 登録が 1 件も存在しないとき、attendees は空配列となる。
  it('指定日に出社登録者がいないとき、getAttendees は空配列を返す（要件 4.7）', async () => {
    const scheduleFind = jest.fn().mockResolvedValue([]);
    const { service } = buildService({ scheduleFind });

    const result = await service.getAttendees('2025-06-16');

    // 応答の date は対象日で、出社者一覧は空。
    expect(result.date).toBe('2025-06-16');
    expect(result.attendees).toEqual([]);
    expect(result.attendees).toHaveLength(0);
  });

  // 例示 2: しきい値不正入力の拒否＋既存値保持（要件 4.4）。
  // 不正なペアは 400（BadRequestException）で拒否され、save が一切呼ばれない
  // （＝既存のしきい値設定が変更されない）。
  it.each([
    { label: 'upper === lower（upper > lower を満たさない）', upper: 50, lower: 50 },
    { label: 'upper < lower', upper: 20, lower: 60 },
    { label: 'upper が範囲外（> 100）', upper: 101, lower: 30 },
    { label: 'lower が範囲外（< 0）', upper: 70, lower: -1 },
    { label: '非整数', upper: 70.5, lower: 30 },
  ])(
    'しきい値不正入力（$label）は 400 で拒否され既存値を変更しない（要件 4.4）',
    async ({ upper, lower }) => {
      const findByCognitoSub = jest.fn().mockResolvedValue(makeAdmin(adminSub));
      const thresholdFindOne = jest
        .fn()
        .mockResolvedValue(makeExistingSetting());
      const thresholdSave = jest.fn();

      const { service } = buildService({
        findByCognitoSub,
        thresholdFindOne,
        thresholdSave,
      });

      // 不正入力は BadRequestException（400）で拒否される。
      await expect(
        service.updateThreshold(adminSub, upper, lower),
      ).rejects.toBeInstanceOf(BadRequestException);

      // 既存値は変更されない（保存処理が呼ばれない）。
      expect(thresholdSave).not.toHaveBeenCalled();
    },
  );

  // 対照: しきい値正常更新（要件 4.3、4.4）。
  // 妥当なペアでは save が呼ばれ、返却値が入力と一致する。
  it('妥当なしきい値では save が呼ばれ、返却値が入力と一致する（要件 4.3、4.4）', async () => {
    const findByCognitoSub = jest.fn().mockResolvedValue(makeAdmin(adminSub));
    const existing = makeExistingSetting();
    const thresholdFindOne = jest.fn().mockResolvedValue(existing);
    // save は保存後のエンティティ（更新済み値）を返す。
    const thresholdSave = jest
      .fn()
      .mockImplementation((entity: ThresholdSetting) =>
        Promise.resolve(entity),
      );

    const { service } = buildService({
      findByCognitoSub,
      thresholdFindOne,
      thresholdSave,
    });

    const result = await service.updateThreshold(adminSub, 70, 30);

    // 保存処理が 1 回呼ばれる。
    expect(thresholdSave).toHaveBeenCalledTimes(1);
    // 返却値は入力どおり。
    expect(result).toEqual({ upperThreshold: 70, lowerThreshold: 30 });
    // 更新者（Administrator の User.id）が記録される。
    const savedEntity = thresholdSave.mock.calls[0][0] as ThresholdSetting;
    expect(savedEntity.updatedBy).toBe('admin-id');
  });

  // 境界: 管理者が DB 未同期（解決できない）のとき、ForbiddenException を伝播し保存しない。
  it('更新者が解決できないとき、ForbiddenException を伝播し保存しない', async () => {
    const findByCognitoSub = jest.fn().mockResolvedValue(null);
    const thresholdSave = jest.fn();

    const { service } = buildService({
      findByCognitoSub,
      thresholdFindOne: jest.fn().mockResolvedValue(makeExistingSetting()),
      thresholdSave,
    });

    // 妥当なペアだが、更新者未解決のため 403 で拒否される。
    await expect(
      service.updateThreshold(adminSub, 70, 30),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // 保存処理は呼ばれない。
    expect(thresholdSave).not.toHaveBeenCalled();
  });
});
