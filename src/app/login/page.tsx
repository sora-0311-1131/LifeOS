'use client';

import React, { useState } from 'react';
import {
  Mail,
  ArrowRight,
  Loader2,
  Sparkles,
  Target,
  Fingerprint,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { siteConfig } from '@/config/site';
import { createClient } from '@/utils/supabase/client';

type AuthStep = 'initial' | 'verify-otp' | 'register-passkey';

export default function LoginPage() {
  const supabase = createClient();

  const [step, setStep] = useState<AuthStep>('initial');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [passkeyName, setPasskeyName] = useState('');
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const finishLogin = () => {
    window.location.assign('/');
  };

  const handlePasskeySignIn = async () => {
    setError(null);
    setInfoMessage(null);
    setIsPasskeyLoading(true);

    try {
      const { error: passkeyError } = await supabase.auth.signInWithPasskey();
      if (passkeyError) {
        setError(passkeyError.message);
        return;
      }
      await finishLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスキー認証に失敗しました');
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setIsOtpLoading(true);

    try {
      const trimmedEmail = email.trim();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });

      if (otpError) {
        setError(otpError.message);
        return;
      }

      setStep('verify-otp');
      setInfoMessage('メールに確認コード（またはログインリンク）を送信しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'メールの送信に失敗しました');
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setIsOtpLoading(true);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: 'email',
      });

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      setStep('register-passkey');
    } catch (err) {
      setError(err instanceof Error ? err.message : '確認コードの検証に失敗しました');
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleRegisterPasskeyAfterOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsPasskeyLoading(true);

    try {
      const { data, error: regError } = await supabase.auth.registerPasskey();
      if (regError) {
        setError(regError.message);
        return;
      }

      if (data?.id && passkeyName.trim()) {
        await supabase.auth.passkey.update({
          passkeyId: data.id,
          friendlyName: passkeyName.trim(),
        });
      }

      await finishLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスキーの登録に失敗しました');
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50/50 dark:bg-neutral-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 dark:bg-blue-600/10 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-500/20 dark:bg-purple-600/10 rounded-full blur-[120px] pointer-events-none translate-x-1/2 translate-y-1/2" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo/Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl flex items-center justify-center shadow-xl shadow-black/5 mb-6 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Target className="w-8 h-8 text-blue-500" />
            <Sparkles className="w-4 h-4 text-blue-500 absolute top-3 right-3 animate-pulse" />
          </div>
          <span className="text-base font-bold tracking-tight text-blue-500 mb-2">
            {siteConfig.name}
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white mb-2 text-center">
            {step === 'initial' && 'Welcome back'}
            {step === 'verify-otp' && 'メールコード認証'}
            {step === 'register-passkey' && 'パスキーの登録'}
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-center text-sm font-medium">
            {step === 'initial' && 'パスキーで素早く安全にサインインできます'}
            {step === 'verify-otp' && `${email} に届いた確認コードを入力してください`}
            {step === 'register-passkey' && '次回から生体認証のみでワンタップでログインできます'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 shadow-2xl shadow-neutral-200/50 dark:shadow-black/50 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="text-sm text-red-600 dark:text-red-400 font-medium">
                {error}
              </div>
            </div>
          )}

          {/* Info Message */}
          {infoMessage && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/50 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                {infoMessage}
              </div>
            </div>
          )}

          {step === 'initial' && (
            <>
              {/* Primary: Passkey Login */}
              <button
                type="button"
                onClick={handlePasskeySignIn}
                disabled={isPasskeyLoading || isOtpLoading}
                className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2.5 transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:opacity-70 disabled:cursor-not-allowed group"
              >
                {isPasskeyLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Fingerprint className="w-5 h-5" />
                    パスキーでログイン
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-neutral-200 dark:border-neutral-800" />
                <span className="flex-shrink mx-3 text-xs font-medium text-neutral-400 dark:text-neutral-500">
                  初回登録・別端末でのログイン
                </span>
                <div className="flex-grow border-t border-neutral-200 dark:border-neutral-800" />
              </div>

              {/* Secondary: Email OTP for new users / adding new device */}
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 ml-1">
                    メールアドレス
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-neutral-400 group-focus-within:text-blue-500 transition-colors" />
                    </div>
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="username webauthn"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-11 pr-4 py-3 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 shadow-sm"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isOtpLoading || isPasskeyLoading}
                  className="w-full py-3 px-4 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed group"
                >
                  {isOtpLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      確認コードを送信
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {step === 'verify-otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 ml-1">
                  確認コード (OTP)
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <KeyRound className="h-5 w-5 text-neutral-400 group-focus-within:text-blue-500 transition-colors" />
                  </div>
                  <input
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 tracking-widest font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 shadow-sm"
                    placeholder="123456"
                  />
                </div>
                <p className="text-xs text-neutral-400 ml-1">
                  ※メール内のログインリンクをクリックしても認証できます。
                </p>
              </div>

              <button
                type="submit"
                disabled={isOtpLoading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isOtpLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    コードを検証して次へ
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('initial');
                  setOtpCode('');
                  setError(null);
                  setInfoMessage(null);
                }}
                className="w-full py-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                メールアドレスの入力に戻る
              </button>
            </form>
          )}

          {step === 'register-passkey' && (
            <form onSubmit={handleRegisterPasskeyAfterOtp} className="space-y-5">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                  メール認証が完了しました！続けてこの端末にパスキーを登録しましょう。
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 ml-1">
                  パスキーの表示名（任意）
                </label>
                <input
                  type="text"
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                  maxLength={120}
                  className="block w-full px-4 py-3 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 shadow-sm"
                  placeholder="例: MacBook Touch ID / iPhone"
                />
              </div>

              <button
                type="submit"
                disabled={isPasskeyLoading}
                className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-blue-500/25 disabled:opacity-70"
              >
                {isPasskeyLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Fingerprint className="w-5 h-5" />
                    この端末にパスキーを登録する
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={finishLogin}
                disabled={isPasskeyLoading}
                className="w-full py-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
              >
                あとで設定画面から登録する（スキップ）
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
