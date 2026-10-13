// Feature: ai-team-planner
// 管理者向けチーム管理画面（Admin Team Management）。
//
// 設計方針:
// - マウント時にチーム一覧（GET /teams）を取得し、取得中はローディング、失敗時はエラーを表示する。
// - 作成フォーム: チーム名入力 + 「作成」ボタン。送信時に前後空白を除去し、空の場合は
//   インライン検証メッセージを表示して API を呼ばない。成功時は返却されたチームを一覧へ反映し、
//   入力をクリアして成功メッセージを表示する。送信中はボタンを無効化して二重送信を防ぐ。
// - 失敗時は ApiError を日本語メッセージへ変換する（409: 重複、400: サーバーメッセージ、その他: 汎用）。
// - 一覧はテーブルで描画する（チーム名・リーダー）。アクセシビリティのため <th scope="col"> を付与し、
//   リーダー未設定は「未設定」と表示する。Tailwind のスタイルは UserManagement.tsx と揃える。

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, teamsApi } from '../../api';
import type { Team } from '../../types';

/**
 * 初回読込失敗など、一般的な API 例外を日本語メッセージへ変換する。
 */
function toLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return 'チーム一覧の取得に失敗しました。時間をおいて再度お試しください。';
}

/**
 * チーム作成失敗時の ApiError を日本語メッセージへ変換する。
 * - 409: チーム名重複
 * - 400: サーバーの日本語メッセージを優先（無ければ汎用の入力確認）
 * - その他: 汎用メッセージ
 */
function toCreateErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 409) {
      return 'そのチーム名は既に使用されています。';
    }
    if (error.statusCode === 400) {
      return error.message || '入力内容を確認してください。';
    }
  }
  return 'チームの作成に失敗しました。時間をおいて再度お試しください。';
}

/**
 * 管理者向けチーム管理画面コンポーネント。
 */
export function TeamManagement() {
  // チーム一覧。
  const [teams, setTeams] = useState<Team[]>([]);
  // 初回読込中フラグ。
  const [isLoading, setIsLoading] = useState(true);
  // 初回読込エラー。
  const [loadError, setLoadError] = useState<string | null>(null);

  // 作成フォームの入力値（チーム名）。
  const [name, setName] = useState('');
  // 作成送信中フラグ（二重送信防止・ボタン無効化）。
  const [isSubmitting, setIsSubmitting] = useState(false);
  // フォームの検証・送信エラー。
  const [formError, setFormError] = useState<string | null>(null);
  // 作成成功メッセージ。
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 削除処理中のチーム ID（対象行の削除ボタンを無効化し、二重実行を防ぐ）。
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 削除失敗時のエラーメッセージ。
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // マウント時にチーム一覧を取得する。
  useEffect(() => {
    let cancelled = false;

    async function loadTeams() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const teamList = await teamsApi.getTeams();
        if (!cancelled) {
          setTeams(teamList);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(toLoadErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTeams();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 作成フォームの送信ハンドラ。
   * 前後空白を除去し、空なら検証エラーを出して API を呼ばない。
   * 成功時は返却チームを一覧の先頭へ追加し、入力をクリアして成功メッセージを表示する。
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const trimmed = name.trim();
    if (trimmed === '') {
      setFormError('チーム名を入力してください。');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await teamsApi.createTeam(trimmed);
      // 返却されたチームを一覧の先頭へ反映する。
      setTeams((prev) => [created, ...prev]);
      setName('');
      setSuccessMessage(`チーム「${created.name}」を作成しました。`);
    } catch (error) {
      setFormError(toCreateErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * チームを削除する。削除前に確認ダイアログを表示し、承諾時のみ DELETE /teams/:id を呼ぶ。
   * 成功時は一覧から該当チームを除去する。失敗時は削除エラーを表示する。
   */
  async function handleDelete(team: Team): Promise<void> {
    const confirmed = window.confirm(
      `チーム「${team.name}」を削除します。所属メンバーは未所属に戻ります。よろしいですか？`,
    );
    if (!confirmed) {
      return;
    }

    setDeleteError(null);
    setSuccessMessage(null);
    setDeletingId(team.id);
    try {
      await teamsApi.deleteTeam(team.id);
      setTeams((prev) => prev.filter((t) => t.id !== team.id));
      setSuccessMessage(`チーム「${team.name}」を削除しました。`);
    } catch (error) {
      setDeleteError(
        error instanceof ApiError && error.message
          ? error.message
          : 'チームの削除に失敗しました。時間をおいて再度お試しください。',
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section>
      <h1 className="mb-4 text-xl font-bold text-gray-900">チーム管理</h1>

      {/* チーム作成フォーム */}
      <form
        onSubmit={handleSubmit}
        className="mb-6 rounded-lg border border-gray-200 bg-white p-4"
        noValidate
      >
        <label htmlFor="team-name" className="block text-sm font-medium text-gray-700">
          チーム名
        </label>
        <div className="mt-1 flex items-start gap-2">
          <input
            id="team-name"
            type="text"
            value={name}
            disabled={isSubmitting}
            onChange={(e) => setName(e.target.value)}
            className="w-64 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            placeholder="チーム名を入力"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isSubmitting ? '作成中...' : '作成'}
          </button>
        </div>

        {/* 検証・送信エラー */}
        {formError && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {formError}
          </p>
        )}

        {/* 作成成功メッセージ */}
        {successMessage && (
          <p role="status" className="mt-2 text-xs text-green-700">
            {successMessage}
          </p>
        )}
      </form>

      {/* チーム一覧 */}
      {isLoading ? (
        <div className="py-10 text-center text-sm text-gray-500" role="status">
          読み込み中...
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {loadError}
        </div>
      ) : teams.length === 0 ? (
        <p className="text-sm text-gray-500">チームが存在しません。</p>
      ) : (
        <div className="space-y-2">
          {/* 削除エラー */}
          {deleteError && (
            <div
              role="alert"
              className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {deleteError}
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                  チーム名
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                  リーダー
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-gray-700">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {teams.map((team) => {
                const isDeleting = deletingId === team.id;
                return (
                  <tr key={team.id}>
                    <td className="px-4 py-3 text-gray-900">{team.name}</td>
                    <td className="px-4 py-3 text-gray-700">{team.leaderName ?? '未設定'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-label={`チーム「${team.name}」を削除`}
                        disabled={isDeleting}
                        onClick={() => handleDelete(team)}
                        className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDeleting ? '削除中...' : '削除'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </section>
  );
}

export default TeamManagement;
