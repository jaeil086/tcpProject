/**
 * =============================================================================
 * ダミーデータ削除スクリプト（動作確認用ユーティリティ）
 * =============================================================================
 *
 * 目的:
 *   seed-dummy.ts が投入したダミー従業員（email が dummy-emp-*@example.com）と、
 *   それに紐づく勤務予定を削除し、本番テスト前に DB をクリーンな状態へ戻す。
 *
 * 削除対象:
 *   - email が 'dummy-emp-' で始まる従業員（role=employee）
 *   - 上記ユーザーに紐づく勤務予定（schedule）は外部キー ON DELETE CASCADE により
 *     ユーザー削除時に自動削除される。
 *
 * 保護:
 *   - 管理者（super_admin / team_admin）や、dummy-emp- 以外のメールアドレスを持つ
 *     ユーザーは一切削除しない。
 *   - しきい値設定（threshold_setting）の updated_by が削除対象ユーザーを参照している
 *     場合は、外部キー違反（ON DELETE NO ACTION）を避けるため、残存する管理者
 *     （super_admin 優先）へ updated_by を付け替えてから削除する。
 *
 * 実行方法（ローカル ts-node）:
 *   npm run seed:clean
 * 実行方法（Docker 本番イメージ）:
 *   docker compose exec backend npm run seed:clean:prod
 * =============================================================================
 */

import 'reflect-metadata';
import { Like } from 'typeorm';
import AppDataSource from './data-source';
import { User } from './entities/user.entity';
import { ThresholdSetting } from './entities/threshold-setting.entity';
import { UserRole } from './entities/enums';

/** ダミー従業員のメールアドレス接頭辞（seed-dummy.ts と一致させる）。 */
const DUMMY_EMAIL_PREFIX = 'dummy-emp-';

async function run(): Promise<void> {
  console.log('=== ダミーデータの削除を開始します ===');
  await AppDataSource.initialize();
  console.log('[DB] データソースを初期化しました。');

  try {
    const userRepo = AppDataSource.getRepository(User);
    const thresholdRepo = AppDataSource.getRepository(ThresholdSetting);

    // 1) 削除対象のダミー従業員を抽出する（email が dummy-emp- で始まるユーザー）。
    const dummyUsers = await userRepo.find({
      where: { email: Like(`${DUMMY_EMAIL_PREFIX}%`) },
    });

    if (dummyUsers.length === 0) {
      console.log('[従業員] 削除対象のダミー従業員は存在しませんでした。');
      return;
    }

    console.log(`[従業員] 削除対象: ${dummyUsers.length} 名`);
    const dummyIds = dummyUsers.map((u) => u.id);

    // 2) しきい値設定の updated_by が削除対象を参照している場合に備え、残存管理者へ付け替える。
    //    （threshold_setting.updated_by は ON DELETE NO ACTION のため、放置すると FK 違反になる。）
    const survivingAdmin =
      (await userRepo.findOne({ where: { role: UserRole.SuperAdmin } })) ??
      (await userRepo.findOne({ where: { role: UserRole.TeamAdmin } }));

    const settings = await thresholdRepo.find();
    for (const setting of settings) {
      if (dummyIds.includes(setting.updatedBy)) {
        if (!survivingAdmin) {
          console.warn(
            '[しきい値] updated_by が削除対象ですが、付け替え先の管理者が見つかりません。',
          );
          continue;
        }
        setting.updatedBy = survivingAdmin.id;
        await thresholdRepo.save(setting);
        console.log(
          `[しきい値] updated_by を ${survivingAdmin.email} へ付け替えました。`,
        );
      }
    }

    // 3) ダミー従業員を削除する（紐づく勤務予定は CASCADE で自動削除）。
    await userRepo.remove(dummyUsers);
    console.log(`[従業員] ${dummyUsers.length} 名を削除しました（勤務予定も連動削除）。`);

    console.log('=== ダミーデータの削除が正常に完了しました ===');
  } finally {
    await AppDataSource.destroy();
    console.log('[DB] データソースを破棄しました。');
  }
}

run().catch((error) => {
  console.error('[エラー] ダミーデータの削除に失敗しました:', error);
  process.exitCode = 1;
});
