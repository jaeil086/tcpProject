/**
 * 既存ユーザーの勤務予定（schedule）を無作為に投入するシードスクリプト。
 *
 * 目的:
 *   チームカレンダー／ダッシュボードで「未登録」になっているメンバーに対し、
 *   Target_Week（翌週の月〜金、平日 5 日間）の勤務予定を無作為（出社／在宅）に設定する。
 *
 * 対象:
 *   DB 上のすべてのユーザー（ロール・所属チームを問わない）。
 *   チーム別カレンダーで確認したい場合は、対象ユーザーが該当チームへ所属している必要がある。
 *
 * 動作モード（環境変数 SEED_SCHEDULE_OVERWRITE で切り替え）:
 *   - 既定（未設定 / 'false'）: 「未登録の日付のみ」を埋める。
 *       既に登録済みの (user, date) は変更しない（例: user-01 / user-03 の既存予定を保護）。
 *   - 'true': すべての対象日を無作為値で upsert（上書き）する。
 *
 * 出社確率:
 *   既定は 0.6（約 6 割が出社）。環境変数 SEED_OFFICE_RATIO（0〜1）で調整可能。
 *
 * 再現性:
 *   環境変数 SEED_RANDOM_SEED に数値を指定すると、決定的（毎回同じ）な結果になる。
 *   未指定の場合は Math.random を用い、実行ごとに異なる結果になる。
 *
 * 冪等性:
 *   (userId, date) で upsert するため、再実行しても重複行は発生しない。
 *
 * 実行方法:
 *   開発:   npm run seed:schedules
 *   本番:   npm run seed:schedules:prod（dist からの実行）
 *   例:     SEED_OFFICE_RATIO=0.5 SEED_RANDOM_SEED=42 npm run seed:schedules
 */
import 'reflect-metadata';
import AppDataSource from './data-source';
import { User } from './entities/user.entity';
import { Schedule } from './entities/schedule.entity';
import { WorkLocation } from './entities/enums';
import { resolveTargetWeek } from './domain/target-week';

/** 既定の出社確率（0〜1）。 */
const DEFAULT_OFFICE_RATIO = 0.6;

/**
 * 環境変数から出社確率を解決する（0〜1 にクランプ）。
 * 不正値・未設定の場合は既定値を返す。
 */
function resolveOfficeRatio(): number {
  const raw = process.env.SEED_OFFICE_RATIO?.trim();
  if (!raw) {
    return DEFAULT_OFFICE_RATIO;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    return DEFAULT_OFFICE_RATIO;
  }
  return Math.min(1, Math.max(0, parsed));
}

/**
 * 乱数生成器を返す。
 * SEED_RANDOM_SEED が指定されていれば決定的な擬似乱数（mulberry32）を、
 * 未指定なら Math.random を用いる。
 */
function createRandom(): () => number {
  const rawSeed = process.env.SEED_RANDOM_SEED?.trim();
  if (!rawSeed) {
    return Math.random;
  }
  const seed = Number(rawSeed);
  if (Number.isNaN(seed)) {
    return Math.random;
  }
  // mulberry32: 小さく決定的な擬似乱数生成器。
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** シード処理のエントリポイント。 */
async function run(): Promise<void> {
  await AppDataSource.initialize();
  console.log('=== 勤務予定の無作為シード処理を開始します ===');

  try {
    const overwrite = process.env.SEED_SCHEDULE_OVERWRITE?.trim() === 'true';
    const officeRatio = resolveOfficeRatio();
    const random = createRandom();

    // Target_Week（翌週の月〜金、平日 5 日分）をサーバー現在日から導出する。
    const today = new Date().toISOString().slice(0, 10);
    const { weekStart, dates } = resolveTargetWeek(today);
    console.log(`[対象週] weekStart=${weekStart} / 日付=${dates.join(', ')}`);
    console.log(
      `[設定] 出社確率=${officeRatio} / 上書き=${overwrite ? '有効' : '無効（未登録のみ埋める）'}`,
    );

    const userRepo = AppDataSource.getRepository(User);
    const scheduleRepo = AppDataSource.getRepository(Schedule);

    const users = await userRepo.find({ order: { name: 'ASC' } });
    if (users.length === 0) {
      console.log('[勤務予定] ユーザーが存在しないため処理を終了します。');
      return;
    }
    console.log(`[対象ユーザー] ${users.length} 名`);

    // 上書きしない場合は、既存の (userId, date) を事前に取得してスキップ判定に使う。
    const existingKeys = new Set<string>();
    if (!overwrite) {
      const existing = await scheduleRepo.find({
        select: { userId: true, date: true },
      });
      for (const s of existing) {
        existingKeys.add(`${s.userId}|${s.date}`);
      }
    }

    let created = 0;
    let skipped = 0;
    for (const user of users) {
      for (const date of dates) {
        if (!overwrite && existingKeys.has(`${user.id}|${date}`)) {
          skipped++;
          continue;
        }
        const workLocation =
          random() < officeRatio ? WorkLocation.Office : WorkLocation.Remote;
        await scheduleRepo.upsert(
          { userId: user.id, date, workLocation },
          ['userId', 'date'],
        );
        created++;
      }
    }

    console.log(
      `[勤務予定] upsert=${created} 件 / スキップ（登録済み）=${skipped} 件`,
    );
    console.log('=== 勤務予定の無作為シード処理が正常に完了しました ===');
    console.log(
      `※ チームカレンダー／ダッシュボードで weekStart=${weekStart} の週を確認してください。`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((error) => {
  console.error('勤務予定の無作為シード処理に失敗しました:', error);
  process.exitCode = 1;
});
