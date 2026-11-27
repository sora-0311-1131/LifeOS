import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { unauthorizedJson } from '@/lib/study/auth';
import { createClient as createServerClient } from '@/utils/supabase/server';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

/**
 * DELETE /api/settings/tokens/[id]
 * Revokes (deletes) an API token owned by the authenticated user.
 * Uses the authenticated Supabase client under RLS (`authenticated` has DELETE privilege).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return unauthorizedJson();
  }

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      { error: 'Invalid token ID' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { data, error } = await supabase
    .from('api_tokens')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[api/settings/tokens/[id]] Failed to delete token:', error);
    return NextResponse.json(
      { error: 'Failed to delete API token' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: 'API token not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    { deleted: true, id: data.id },
    { headers: NO_STORE_HEADERS }
  );
}
