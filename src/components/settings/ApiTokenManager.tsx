'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyRound,
  Plus,
  Trash2,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { ApiTokenSummary } from '@/types/study';

interface CreatedTokenState {
  id?: string;
  name: string;
  rawToken: string;
}

export default function ApiTokenManager() {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState<CreatedTokenState | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/tokens', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'API トークンの取得に失敗しました');
        return;
      }
      setTokens(Array.isArray(data.tokens) ? data.tokens : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API トークンの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/settings/tokens', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(data?.error || 'API トークンの取得に失敗しました');
        } else {
          setTokens(Array.isArray(data.tokens) ? data.tokens : []);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'API トークンの取得に失敗しました');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleCreateToken = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = newTokenName.trim();
    if (!trimmedName) return;

    setError(null);
    setSuccessMessage(null);
    setIsCreating(true);
    setCopied(false);

    try {
      const res = await fetch('/api/settings/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'API トークンの発行に失敗しました');
        return;
      }

      setNewTokenName('');
      setCreatedToken({
        id: data.token?.id,
        name: data.token?.name ?? trimmedName,
        rawToken: data.rawToken,
      });
      setSuccessMessage('新しい API トークンを発行しました。');
      if (data.token) {
        setTokens((prev) => [data.token as ApiTokenSummary, ...prev]);
      } else {
        await loadTokens();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API トークンの発行に失敗しました');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyToken = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken.rawToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('クリップボードへのコピーに失敗しました。トークンを手動で選択してコピーしてください。');
    }
  };

  const handleDeleteToken = async (tokenId: string) => {
    setError(null);
    setSuccessMessage(null);
    setDeletingId(tokenId);

    try {
      const res = await fetch(`/api/settings/tokens/${tokenId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'API トークンの削除に失敗しました');
        return;
      }

      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      setConfirmDeleteId(null);
      if (createdToken?.id === tokenId) {
        setCreatedToken(null);
        setCopied(false);
      }
      setSuccessMessage('API トークンを失効・削除しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API トークンの削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '未使用';
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <KeyRound className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
            API トークン（ショートカット・外部連携）
          </h2>
          <p className="text-xs text-neutral-500">
            iOS ショートカットや NFC タグから Study タイマー等を操作するための Bearer トークンを管理します
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-xl text-sm text-red-600 dark:text-red-400 font-medium">
          {error}
        </div>
      )}

      {successMessage && !createdToken && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-sm text-emerald-700 dark:text-emerald-300 font-medium">
          {successMessage}
        </div>
      )}

      {/* One-time raw token display banner */}
      {createdToken && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  「{createdToken.name}」を発行しました（この画面を閉じると二度と表示されません）
                </p>
                <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                  今すぐコピーして iOS ショートカット等の Authorization ヘッダー（Bearer）に設定してください。
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreatedToken(null);
                setCopied(false);
              }}
              className="p-1 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg"
              aria-label="Close token banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-white dark:bg-neutral-950 border border-amber-200 dark:border-amber-900 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 break-all select-all">
              {createdToken.rawToken}
            </code>
            <button
              type="button"
              onClick={handleCopyToken}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors flex-shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  コピー済み
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  コピー
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Issue new token form */}
      <form onSubmit={handleCreateToken} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={newTokenName}
          onChange={(e) => setNewTokenName(e.target.value)}
          maxLength={100}
          placeholder="トークン名（例: iPhone NFC / 自宅デスクタグ）"
          className="flex-1 px-4 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={isCreating || !newTokenName.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        >
          {isCreating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Plus className="w-4 h-4" />
              トークンを発行
            </>
          )}
        </button>
      </form>

      {/* Issued tokens list */}
      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
        {isLoading ? (
          <div className="py-8 flex justify-center text-neutral-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-neutral-500 py-4">
            発行済みの API トークンはありません。上のフォームから新しいトークンを発行してください。
          </p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-neutral-900 dark:text-white text-sm">
                      {token.name}
                    </span>
                    <code className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs font-mono">
                      {token.token_prefix}…
                    </code>
                    {token.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-[11px] font-medium"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-neutral-400 flex flex-wrap gap-x-3 gap-y-1">
                    <span>作成日: {formatDate(token.created_at)}</span>
                    <span>最終利用: {formatDate(token.last_used_at)}</span>
                  </div>
                </div>

                {confirmDeleteId === token.id ? (
                  <div className="flex items-center gap-2 self-start sm:self-center flex-shrink-0">
                    <button
                      type="button"
                      disabled={deletingId === token.id}
                      onClick={() => handleDeleteToken(token.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-60"
                    >
                      {deletingId === token.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        '失効・削除する'
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === token.id}
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                    >
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(token.id)}
                    className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                    失効 / 削除
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
