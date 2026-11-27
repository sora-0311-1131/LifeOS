import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { hashApiToken, unauthorizedJson } from '@/lib/study/auth';
import type { ApiTokenSummary } from '@/types/study';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient as createServerClient } from '@/utils/supabase/server';

const API_TOKEN_SUMMARY_COLUMNS =
  'id, name, token_prefix, scopes, last_used_at, revoked_at, created_at';

const MAX_TOKEN_NAME_LENGTH = 100;
const ALLOWED_SCOPES = new Set(['study:write', 'study:read']);
const DEFAULT_SCOPES = ['study:write'];

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

function generateRawApiToken(): { rawToken: string; tokenPrefix: string } {
  const randomHex = randomBytes(32).toString('hex');
  const rawToken = `lifeos_${randomHex}`;
  // Store a short display prefix (e.g. "lifeos_9a3f1") without leaking secret entropy
  const tokenPrefix = rawToken.slice(0, 12);
  return { rawToken, tokenPrefix };
}

/**
 * GET /api/settings/tokens
 * Lists the authenticated user's Personal API Tokens without exposing `token_hash`.
 * Browser session cookie authentication only.
 */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return unauthorizedJson();
  }

  const { data, error } = await supabase
    .from('api_tokens')
    .select(API_TOKEN_SUMMARY_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[api/settings/tokens] Failed to list tokens:', error);
    return NextResponse.json(
      { error: 'Failed to load API tokens' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    { tokens: (data ?? []) as ApiTokenSummary[] },
    { headers: NO_STORE_HEADERS }
  );
}

/**
 * POST /api/settings/tokens
 * Issues a new Personal API Token for the authenticated user.
 * Inserts via Service Role (as `authenticated` has no INSERT privilege on `api_tokens`)
 * and returns the raw token exactly once in the response.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return unauthorizedJson();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { name: rawName, scopes: rawScopes } = body as {
    name?: unknown;
    scopes?: unknown;
  };

  if (typeof rawName !== 'string') {
    return NextResponse.json(
      { error: 'Token name is required' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const name = rawName.trim();
  if (name.length === 0 || name.length > MAX_TOKEN_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Token name must be between 1 and ${MAX_TOKEN_NAME_LENGTH} characters` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  let scopes = DEFAULT_SCOPES;
  if (rawScopes !== undefined) {
    if (
      !Array.isArray(rawScopes) ||
      rawScopes.length === 0 ||
      !rawScopes.every((s): s is string => typeof s === 'string' && ALLOWED_SCOPES.has(s))
    ) {
      return NextResponse.json(
        { error: 'Invalid scopes specified' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    scopes = Array.from(new Set(rawScopes));
  }

  const { rawToken, tokenPrefix } = generateRawApiToken();
  const tokenHash = hashApiToken(rawToken);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('api_tokens')
    .insert({
      user_id: user.id,
      name,
      token_prefix: tokenPrefix,
      token_hash: tokenHash,
      scopes,
    })
    .select(API_TOKEN_SUMMARY_COLUMNS)
    .single();

  if (error || !data) {
    console.error('[api/settings/tokens] Failed to create token:', error);
    return NextResponse.json(
      { error: 'Failed to create API token' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      token: data as ApiTokenSummary,
      rawToken,
    },
    { status: 201, headers: NO_STORE_HEADERS }
  );
}
