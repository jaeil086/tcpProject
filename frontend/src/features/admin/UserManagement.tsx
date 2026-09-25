// Feature: ai-team-planner
// 管理者向けユーザー管理画面（Admin User Management）。
//
// 設計方針:
// - マウント時にユーザー一覧（GET /users）とチーム一覧（GET /teams）を並列取得する。
//   チーム一覧はチーム割り当てプルダウンの選択肢に用いる。取得中はローディング表示を出す。
// - 一覧はテーブルで描画する（氏名・メール・ロール・所属チーム・操作）。
//   アクセシビリティのため <th scope="col"> を付与し、操作系コントロールには aria-label を付ける。
// - チーム割り当て: <select>（「未所属」= null を含む）を変更すると PUT /users/:id/team を呼び、
//   成功時は返却された AdminUserView で該当行を差し替える。失敗時は行単位のエラーを表示する。
// - ロール変更: <select>（従業員 / 管理者）を変更すると PUT /users/:id/role を呼ぶ。
//   成功時は該当行を差し替え、失敗時（例: 自己降格の 400）はサーバーの日本語メッセージを表示する。
// - 更新中の行は該当コントロールを無効化し、二重送信を防ぐ。

import { useEffect, useState } from 'react';
import { ApiError, calendarApi, usersApi } from '../../api';
import { UserRole, type AdminUserView, type Team } from '../../types';

/** 「未所属」を表す <select> の値（null を DOM 上で扱うための番兵）。 */
const UNASSIGNED_TEAM_VALUE = '__unassigned__';

/**
 * ロールを日本語ラベルへ変換する。
 */
function roleLabel(role: UserRole): string {
  return role === UserRole.Administrator ? '管理者' : '従業員';
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

/**
 * 管理者向けユーザー管理画面コンポーネント。
 */
export function UserManagement() {
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

  return (
    <section>
      <h1 className="mb-4 text-xl font-bold text-gray-900">ユーザー管理</h1>

      {users.length === 0 ? (
        <p className="text-sm text-gray-500">対象ユーザーが存在しません。</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => {
                const isUpdating = updatingIds.has(user.id);
                const rowError = rowErrors[user.id];
                return (
                  <tr key={user.id} className="align-top">
                    <td className="px-4 py-3 text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-gray-700">{user.email}</td>

                    {/* ロール変更 */}
                    <td className="px-4 py-3">
                      <select
                        aria-label={`${user.name} のロール`}
                        value={user.role}
                        disabled={isUpdating}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                        className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        <option value={UserRole.Employee}>{roleLabel(UserRole.Employee)}</option>
                        <option value={UserRole.Administrator}>
                          {roleLabel(UserRole.Administrator)}
                        </option>
                      </select>
                    </td>

                    {/* チーム割り当て */}
                    <td className="px-4 py-3">
                      <select
                        aria-label={`${user.name} の所属チーム`}
                        value={user.teamId ?? UNASSIGNED_TEAM_VALUE}
                        disabled={isUpdating}
                        onChange={(e) => handleTeamChange(user.id, e.target.value)}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default UserManagement;
