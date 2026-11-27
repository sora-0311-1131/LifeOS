import 'server-only';

import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient as createServerClient } from '@/utils/supabase/server';

export type StudyAuthMethod = 'bearer' | 'session';

export interface StudyAuthSuccess {
  ok: true;
  userId: string;
  method: StudyAuthMethod;
  tokenId?: string;
  scopes?: string[];
}

export interface StudyAuthFailure {
  ok: false;
  status: 401 | 403;
  error: string;
}

export type StudyAuthResult = StudyAuthSuccess | StudyAuthFailure;

export interface ResolveStudyAuthOptions {
  /** Optional scope required when authenticating via Personal API Token (e.g. 'study:write'). */
  requiredScope?: string;
}

/**
 * Computes the SHA-256 hex digest of a raw Personal API Token.
 * Raw tokens are never stored in the database; only this hash is persisted and compared.
 */
export function hashApiToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Resolves authentication for Study API routes via two lanes:
 * 1. Bearer Personal API Token (`Authorization: Bearer <token>`) -> verified against `public.api_tokens` using Service Role.
 *    If an Authorization header is present but invalid/revoked, it fails immediately without falling back to cookies.
 * 2. Browser Supabase Auth session cookie -> verified via `supabase.auth.getUser()`.
 */
export async function resolveStudyAuth(
  request: Request,
  options?: ResolveStudyAuthOptions
): Promise<StudyAuthResult> {
  const authHeader = request.headers.get('authorization');

  if (authHeader !== null) {
    const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
    if (!match) {
      return {
        ok: false,
        status: 401,
        error: 'Invalid Authorization header format',
      };
    }

    const rawToken = match[1];
    const tokenHash = hashApiToken(rawToken);
    const admin = createAdminClient();

    const { data: tokenRow, error } = await admin
      .from('api_tokens')
      .select('id, user_id, scopes')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .maybeSingle();

    if (error || !tokenRow) {
      return {
        ok: false,
        status: 401,
        error: 'Invalid or revoked API token',
      };
    }

    const scopes: string[] = Array.isArray(tokenRow.scopes) ? tokenRow.scopes : [];
    if (
      options?.requiredScope &&
      !scopes.includes(options.requiredScope) &&
      !scopes.includes('*')
    ) {
      return {
        ok: false,
        status: 403,
        error: 'Insufficient token scope',
      };
    }

    const { error: updateError } = await admin
      .from('api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRow.id);

    if (updateError) {
      console.error('[study/auth] Failed to update api_tokens.last_used_at:', updateError);
    }

    return {
      ok: true,
      userId: tokenRow.user_id,
      method: 'bearer',
      tokenId: tokenRow.id,
      scopes,
    };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      status: 401,
      error: 'Unauthorized',
    };
  }

  return {
    ok: true,
    userId: user.id,
    method: 'session',
  };
}

export function authErrorResponse(failure: StudyAuthFailure): NextResponse {
  return NextResponse.json({ error: failure.error }, { status: failure.status });
}

export function unauthorizedJson(message = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}
