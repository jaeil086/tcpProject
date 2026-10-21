// Feature: ai-team-planner
// 管理者向けユーザー管理画面（Admin User Management）。
//
// 設計方針:
// - マウント時にユーザー一覧（GET /users）とチーム一覧（GET /teams）を並列取得する。
//   チーム一覧はチーム割り当てプルダウンの選択肢に用いる。取得中はローディング表示を出す。
// - 一覧は「所属チームごと」にセクション分割して描画する。各セクションは見出し（チーム名 + 人数）と
//   テーブル（氏名・メール・ロール・所属チーム・操作）で構成する。未所属ユーザーは末尾の独立
//   セクションにまとめる。チームが増えても縦方向に積み上がるため、横方向への間延びを避けられる。
//   アクセシビリティのため <th scope="col"> を付与し、操作系コントロールには aria-label を付ける。
// - チーム割り当て: <select>（「未所属」= null を含む）を変更すると PUT /users/:id/team を呼び、
//   成功時は返却された AdminUserView で該当行を差し替える。失敗時は行単位のエラーを表示する。
//   チーム割り当ては最上位管理者・チーム管理者の双方が実行できる。
// - ロール変更: <select>（従業員 / チーム管理者 / 最上位管理者）を変更すると PUT /users/:id/role を呼ぶ。
//   成功時は該当行を差し替え、失敗時（例: 自己降格の 400）はサーバーの日本語メッセージを表示する。
//   ロール変更は最上位管理者（super_admin）のみ可能なため、それ以外のユーザーには読み取り専用の
//   ラベル表示に切り替える（バックエンドでも @Roles(SuperAdmin) で保護している）。
// - 更新中の行は該当コントロールを無効化し、二重送信を防ぐ。

import { useEffect, useMemo, useState } from 'react';
import { ApiError, calendarApi, usersApi } from '../../api';
import { useAuth } from '../../auth';
import { UserRole, type AdminUserView, type Team } from '../../types';

/** 「未所属」を表す <select> の値（null を DOM 上で扱うための番兵）。 */
const UNASSIGNED_TEAM_VALUE = '__unassigned__';

/**
 * ロールを日本語ラベルへ変換する（3 階層対応）。
 */
function roleLabel(role: UserRole): string {
  switch (role) {
    case UserRole.SuperAdmin:
      return '最上位管理者';
    case UserRole.TeamAdmin:
      return 'チーム管理者';
    default:
      return '従業員';
  }
}

/**
 * API 例外をユーザー向け日本語メッセージへ変換する。
 * サーバーが日本語メッセージ（例: 自己降格の禁止）を返す場合はそれを優先する。
 */
function toActionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return '更新に失敗しました。時間をおいて再度お試しください。';
}

/** UserRow が各行の操作ハンドラ・権限フラグを受け取るための共通 props。 */
interface UserRowContext {
  teams: Team[];
  canChangeRole: boolean;
  canResetPassword: boolean;
  canDeleteUser: boolean;
  showActions: boolean;
  currentUserId: string | undefined;
  isUpdating: boolean;
  rowError: string | undefined;
  tempPassword: string | undefined;
  onRoleChange: (userId: string, role: UserRole) => void;
  onTeamChange: (userId: string, rawValue: string) => void;
  onResetPassword: (user: AdminUserView) => void;
  onDeleteUser: (user: AdminUserView) => void;
}

/**
 * ユーザー 1 名分のテーブル行。
 * 氏名・メール・ロール・所属チーム・操作（最上位管理者のみ）を描画する。
 * 状態（更新中・行エラー・一時パスワード）は props で受け取り、副作用は持たない。
 */
function UserRow({ user, ctx }: { user: AdminUserView; ctx: UserRowContext }) {
  const {
    teams,
    canChangeRole,
    canResetPassword,
    canDeleteUser,
    showActions,
    currentUserId,
    isUpdating,
    rowError,
    tempPassword,
    onRoleChange,
    onTeamChange,
    onResetPassword,
    onDeleteUser,
  } = ctx;

  return (
    <tr className="align-top">
      <td className="px-4 py-3 text-gray-900">{user.name}</td>
      <td className="px-4 py-3 text-gray-700">{user.email}</td>

      {/* ロール変更（最上位管理者のみ編集可。それ以外は読み取り専用ラベル） */}
      <td className="px-4 py-3">
        {canChangeRole ? (
          <select
            aria-label={`${user.name} のロール`}
            value={user.role}
            disabled={isUpdating}
            onChange={(e) => onRoleChange(user.id, e.target.value as UserRole)}
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
          >
            <option value={UserRole.Employee}>{roleLabel(UserRole.Employee)}</option>
            <option value={UserRole.TeamAdmin}>{roleLabel(UserRole.TeamAdmin)}</option>
            <option value={UserRole.SuperAdmin}>{roleLabel(UserRole.SuperAdmin)}</option>
          </select>
        ) : (
          <span className="text-gray-700">{roleLabel(user.role)}</span>
        )}
      </td>

      {/* チーム割り当て */}
      <td className="px-4 py-3">
        <select
          aria-label={`${user.name} の所属チーム`}
          value={user.teamId ?? UNASSIGNED_TEAM_VALUE}
          disabled={isUpdating}
          onChange={(e) => onTeamChange(user.id, e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
        >
          <option value={UNASSIGNED_TEAM_VALUE}>未所属</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        {/* 行単位の操作エラー（ロール変更・チーム割り当て共通） */}
        {rowError && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {rowError}
          </p>
        )}
      </td>

      {/* 操作（パスワード再設定・削除。最上位管理者のみ） */}
      {showActions && (
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {canResetPassword && (
              <button
                type="button"
                aria-label={`${user.name} のパスワードを再設定`}
                disabled={isUpdating}
                onClick={() => onResetPassword(user)}
                className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUpdating ? '処理中...' : 'パスワード再設定'}
              </button>
            )}

            {/* ユーザー削除（最上位管理者のみ）。自分自身は削除できないためボタンを出さない。 */}
            {canDeleteUser && currentUserId !== user.id && (
              <button
                type="button"
                aria-label={`${user.name} を削除`}
                disabled={isUpdating}
                onClick={() => onDeleteUser(user)}
                className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUpdating ? '処理中...' : '削除'}
              </button>
            )}
          </div>

          {/* 発行された一時パスワード（この表示でのみ確認可能） */}
          {tempPassword && (
            <div className="mt-2 rounded border border-green-300 bg-green-50 px-2 py-1 text-xs text-green-800">
              <p className="font-medium">一時パスワードを発行しました</p>
              <code className="mt-1 block break-all font-mono text-sm text-gray-900">
                {tempPassword}
              </code>
              <p className="mt-1 text-[11px] text-green-700">
                この値は再表示できません。控えて本人へ伝え、初回ログイン後に変更してもらってください。
              </p>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

/** チーム別セクション 1 つ分の表示データ。 */
interface TeamSectionData {
  key: string;
  title: string;
  members: AdminUserView[];
  /** チーム管理者（リーダー）の氏名。未設定・未所属セクションでは null。 */
  leaderName: string | null;
}

/**
 * チーム別のユーザーセクション。
 * 見出し（チーム名 + 人数 + 管理者）をクリックするとメンバー一覧を開閉できる（アコーディオン）。
 */
function TeamSection({
  section,
  showActions,
  isOpen,
  onToggle,
  renderRow,
}: {
  section: TeamSectionData;
  showActions: boolean;
  isOpen: boolean;
  onToggle: (key: string) => void;
  renderRow: (user: AdminUserView) => React.ReactNode;
}) {
  const panelId = `team-section-panel-${section.key}`;

  return (
    <section className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* セクション見出し（開閉トグル）: チーム名 + 人数 + 管理者 */}
      <h2>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => onToggle(section.key)}
          className="flex w-full items-center gap-2 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100"
        >
          {/* 開閉インジケーター（右向き▶／下向き▼） */}
          <span
            aria-hidden="true"
            className={
              'inline-block text-xs text-gray-500 transition-transform ' +
              (isOpen ? 'rotate-90' : '')
            }
          >
            ▶
          </span>
          <span className="text-base font-semibold text-gray-900">{section.title}</span>
          <span className="text-sm text-gray-500">
            （<span className="font-semibold text-gray-700">{section.members.length}</span> 名）
          </span>
          {/* チーム管理者（リーダー）表記 */}
          {section.leaderName ? (
            <span className="ml-1 text-xs text-gray-500">
              管理者: <span className="font-medium text-gray-700">{section.leaderName}</span>
            </span>
          ) : (
            section.key !== UNASSIGNED_TEAM_VALUE && (
              <span className="ml-1 text-xs text-gray-400">管理者: 未設定</span>
            )
          )}
        </button>
      </h2>

      {/* 開いているときのみメンバー一覧を描画する */}
      {isOpen && (
        <div id={panelId}>
          {section.members.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">所属メンバーはいません。</p>
          ) : (
            <div className="overflow-x-auto border-t border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-white">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                      氏名
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                      メール
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                      ロール
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                      所属チーム
                    </th>
                    {showActions && (
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                        操作
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {section.members.map((user) => renderRow(user))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * 管理者向けユーザー管理画面コンポーネント。
 */
export function UserManagement() {
  // ログイン中ユーザー。ロール変更・パスワード再設定・削除の可否（最上位管理者のみ）の判定に用いる。
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === UserRole.SuperAdmin;
  // ロール変更・パスワード再設定・ユーザー削除はいずれも最上位管理者のみ可能。
  const canChangeRole = isSuperAdmin;
  const canResetPassword = isSuperAdmin;
  const canDeleteUser = isSuperAdmin;
  // 操作列（パスワード再設定・削除）を表示するか。最上位管理者のときのみ。
  const showActions = canResetPassword || canDeleteUser;

  // ユーザー一覧。
  const [users, setUsers] = useState<AdminUserView[]>([]);
  // チーム一覧（割り当てプルダウン用）。
  const [teams, setTeams] = useState<Team[]>([]);
  // 初回読込中フラグ。
  const [isLoading, setIsLoading] = useState(true);
  // 初回読込エラー。
  const [loadError, setLoadError] = useState<string | null>(null);
  // 更新処理中のユーザー ID 集合（対象行のコントロールを無効化する）。
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  // 行単位の操作エラー（ユーザー ID → メッセージ）。
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  // パスワード再設定で生成された一時パスワード（ユーザー ID → 一時パスワード）。
  // 管理者が対象ユーザーへ伝達できるよう、再設定直後に該当行へ表示する。
  const [tempPasswords, setTempPasswords] = useState<Record<string, string>>({});

  // マウント時にユーザー一覧とチーム一覧を並列取得する。
  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [userList, teamList] = await Promise.all([
          usersApi.listUsers(),
          calendarApi.getTeams(),
        ]);
        if (!cancelled) {
          setUsers(userList);
          setTeams(teamList);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(toActionErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 指定ユーザーの更新中フラグを設定・解除する。 */
  function setUpdating(userId: string, updating: boolean): void {
    setUpdatingIds((prev) => {
      const next = new Set(prev);
      if (updating) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
      return next;
    });
  }

  /** 指定ユーザーの行エラーを設定・クリアする。 */
  function setRowError(userId: string, message: string | null): void {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message === null) {
        delete next[userId];
      } else {
        next[userId] = message;
      }
      return next;
    });
  }

  /** 更新成功時、該当ユーザー行を返却値で差し替える。 */
  function replaceUser(updated: AdminUserView): void {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  /**
   * チーム割り当てを変更する。「未所属」選択時は teamId=null を送る。
   */
  async function handleTeamChange(userId: string, rawValue: string): Promise<void> {
    const teamId = rawValue === UNASSIGNED_TEAM_VALUE ? null : rawValue;
    setUpdating(userId, true);
    setRowError(userId, null);
    try {
      const updated = await usersApi.assignTeam(userId, teamId);
      replaceUser(updated);
    } catch (error) {
      setRowError(userId, toActionErrorMessage(error));
    } finally {
      setUpdating(userId, false);
    }
  }

  /**
   * ロールを変更する。失敗時（例: 自己降格の 400）はサーバーの日本語メッセージを表示する。
   */
  async function handleRoleChange(userId: string, role: UserRole): Promise<void> {
    setUpdating(userId, true);
    setRowError(userId, null);
    try {
      const updated = await usersApi.updateRole(userId, role);
      replaceUser(updated);
    } catch (error) {
      setRowError(userId, toActionErrorMessage(error));
    } finally {
      setUpdating(userId, false);
    }
  }

  /**
   * 指定ユーザーのパスワードを一時パスワードへ再設定する。
   * 確認ダイアログで承諾した場合のみ実行し、成功時は返却された一時パスワードを該当行に表示する。
   * 一時パスワードはこの応答でのみ取得できるため、管理者が控えて対象ユーザーへ伝達する想定。
   */
  async function handleResetPassword(user: AdminUserView): Promise<void> {
    const confirmed = window.confirm(
      `${user.name}（${user.email}）のパスワードを再設定します。\n` +
        '新しい一時パスワードが発行され、現在のパスワードは無効になります。よろしいですか？',
    );
    if (!confirmed) {
      return;
    }

    setUpdating(user.id, true);
    setRowError(user.id, null);
    try {
      const result = await usersApi.resetPassword(user.id);
      replaceUser(result.user);
      // 生成された一時パスワードを該当行に表示する。
      setTempPasswords((prev) => ({ ...prev, [user.id]: result.temporaryPassword }));
    } catch (error) {
      setRowError(user.id, toActionErrorMessage(error));
    } finally {
      setUpdating(user.id, false);
    }
  }

  /**
   * 指定ユーザーを削除する（最上位管理者のみ）。
   * 確認ダイアログで承諾した場合のみ実行し、成功時は一覧から該当行を取り除く。
   * 自分自身・最後の最上位管理者はサーバー側で拒否され、その旨が行エラーに表示される。
   */
  async function handleDeleteUser(user: AdminUserView): Promise<void> {
    const confirmed = window.confirm(
      `${user.name}（${user.email}）を削除します。\n` +
        'このユーザーと紐づく勤務予定も削除され、元に戻せません。よろしいですか？',
    );
    if (!confirmed) {
      return;
    }

    setUpdating(user.id, true);
    setRowError(user.id, null);
    try {
      await usersApi.deleteUser(user.id);
      // 成功時は一覧から該当ユーザーを取り除く。
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (error) {
      setRowError(user.id, toActionErrorMessage(error));
      setUpdating(user.id, false);
    }
  }

  // チーム別のユーザーセクションを構築する。
  // - 先頭に「未所属」セクションを置く（新規に所属を割り当てる作業を頻繁に行うため最上部へ）。
  //   未所属が 0 名のときは表示しない。
  // - 続けて teams の並び順でチームごとのセクションを作る（所属 0 名のチームも見出しは表示する）。
  // - 各チーム見出しには管理者（リーダー）名を表示する（teams[].leaderName を利用）。
  // - 各セクション内のメンバーは氏名の昇順（listUsers 側で name ASC 済みだが、念のため安定化）。
  const sections = useMemo<TeamSectionData[]>(() => {
    const membersByTeam = new Map<string, AdminUserView[]>();
    const unassigned: AdminUserView[] = [];
    for (const u of users) {
      if (u.teamId) {
        const list = membersByTeam.get(u.teamId) ?? [];
        list.push(u);
        membersByTeam.set(u.teamId, list);
      } else {
        unassigned.push(u);
      }
    }

    const result: TeamSectionData[] = [];

    // 1) 未所属セクションを先頭に置く（該当者がいる場合のみ）。
    if (unassigned.length > 0) {
      result.push({
        key: UNASSIGNED_TEAM_VALUE,
        title: '未所属',
        members: unassigned,
        leaderName: null,
      });
    }

    // 2) 各チームのセクション（teams の並び順）。
    for (const team of teams) {
      result.push({
        key: team.id,
        title: team.name,
        members: membersByTeam.get(team.id) ?? [],
        leaderName: team.leaderName,
      });
    }

    return result;
  }, [users, teams]);

  // セクションの開閉状態（key → 開いているか）。既定は全セクションを開いた状態にする。
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  // sections が確定したら、まだ状態を持たないセクションを既定（開）で初期化する。
  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of sections) {
        if (next[s.key] === undefined) {
          next[s.key] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [sections]);

  /** 指定セクションの開閉を切り替える。 */
  function toggleSection(key: string): void {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (isLoading) {
    return (
      <div className="py-10 text-center text-sm text-gray-500" role="status">
        読み込み中...
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {loadError}
      </div>
    );
  }

  /** 1 行分の UserRow を、行ごとの状態を注入して描画する。 */
  function renderRow(user: AdminUserView): React.ReactNode {
    return (
      <UserRow
        key={user.id}
        user={user}
        ctx={{
          teams,
          canChangeRole,
          canResetPassword,
          canDeleteUser,
          showActions,
          currentUserId: currentUser?.id,
          isUpdating: updatingIds.has(user.id),
          rowError: rowErrors[user.id],
          tempPassword: tempPasswords[user.id],
          onRoleChange: handleRoleChange,
          onTeamChange: handleTeamChange,
          onResetPassword: handleResetPassword,
          onDeleteUser: handleDeleteUser,
        }}
      />
    );
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold text-gray-900">ユーザー管理</h1>
        {/* 総ユーザー数 */}
        <span className="text-sm text-gray-600">
          総ユーザー数: <span className="font-semibold text-gray-900">{users.length}</span> 名
        </span>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-gray-500">対象ユーザーが存在しません。</p>
      ) : (
        <div>
          {sections.map((section) => (
            <TeamSection
              key={section.key}
              section={section}
              showActions={showActions}
              isOpen={openSections[section.key] ?? true}
              onToggle={toggleSection}
              renderRow={renderRow}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default UserManagement;
