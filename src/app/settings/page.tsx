'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Fingerprint,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

type PasskeyItem = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

export default function SettingsPage() {
  const supabase = createClient();

  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    const { data, error: listError } = await supabase.auth.passkey.list();
    if (listError) {
      setError(listError.message);
    } else if (data) {
      setPasskeys(data);
    }
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    supabase.auth.passkey.list().then(({ data, error: listError }) => {
      if (!active) return;
      if (listError) {
        setError(listError.message);
      } else if (data) {
        setPasskeys(data);
      }
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  const handleRegisterPasskey = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsRegistering(true);

    try {
      const { data, error: regError } = await supabase.auth.registerPasskey();
      if (regError) {
        setError(regError.message);
        return;
      }

      if (data?.id && newPasskeyName.trim()) {
        await supabase.auth.passkey.update({
          passkeyId: data.id,
          friendlyName: newPasskeyName.trim(),
        });
      }

      setNewPasskeyName('');
      setSuccessMessage('新しいパスキーを登録しました。');
      await loadPasskeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスキーの登録に失敗しました');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleUpdateName = async (passkeyId: string) => {
    if (!editingName.trim()) return;
    setError(null);
    const { error: updateError } = await supabase.auth.passkey.update({
      passkeyId,
      friendlyName: editingName.trim(),
    });
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditingId(null);
    setEditingName('');
    await loadPasskeys();
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    setError(null);
    setSuccessMessage(null);
    const { error: delError } = await supabase.auth.passkey.delete({ passkeyId });
    if (delError) {
      setError(delError.message);
      return;
    }
    setSuccessMessage('パスキーを削除しました。');
    await loadPasskeys();
  };

  const formatDate = (iso?: string) => {
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
    <main className="p-4 sm:p-8 lg:p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            Settings
          </h1>
          <p className="text-neutral-500 mt-2">
            パスキー（生体認証・セキュリティキー）の登録と管理を行います。
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-xl text-sm text-red-600 dark:text-red-400 font-medium">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-sm text-emerald-700 dark:text-emerald-300 font-medium">
            {successMessage}
          </div>
        )}

        {/* Register new passkey */}
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                パスキーを追加登録
              </h2>
              <p className="text-xs text-neutral-500">
                この端末の Face ID / Touch ID / Windows Hello 等を登録します
              </p>
            </div>
          </div>

          <form onSubmit={handleRegisterPasskey} className="flex flex-col sm:flex-row gap-3 pt-2">
            <input
              type="text"
              value={newPasskeyName}
              onChange={(e) => setNewPasskeyName(e.target.value)}
              maxLength={120}
              placeholder="端末名（任意: MacBook Pro / iPhone 等）"
              className="flex-1 px-4 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={isRegistering}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
            >
              {isRegistering ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  パスキーを登録
                </>
              )}
            </button>
          </form>
        </section>

        {/* Registered passkeys list */}
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
              登録済みのパスキー
            </h2>
          </div>

          {isLoading ? (
            <div className="py-8 flex justify-center text-neutral-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-neutral-500 py-4">
              まだパスキーが登録されていません。上のボタンからこの端末のパスキーを登録してください。
            </p>
          ) : (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    {editingId === pk.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          maxLength={120}
                          className="px-3 py-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateName(pk.id)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg"
                          aria-label="Save name"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg"
                          aria-label="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-900 dark:text-white text-sm">
                          {pk.friendly_name || '名称未設定のパスキー'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(pk.id);
                            setEditingName(pk.friendly_name || '');
                          }}
                          className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                          aria-label="Rename passkey"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="text-xs text-neutral-400 space-x-3">
                      <span>登録日: {formatDate(pk.created_at)}</span>
                      <span>最終利用: {formatDate(pk.last_used_at)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeletePasskey(pk.id)}
                    className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
