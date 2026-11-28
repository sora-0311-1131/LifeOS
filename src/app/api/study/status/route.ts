import { NextResponse } from 'next/server';
import {
  authErrorResponse,
  getStudySupabaseClient,
  resolveStudyAuth,
} from '@/lib/study/auth';
import { getStudyStatus } from '@/lib/study/study-service';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await resolveStudyAuth(request);
  if (!auth.ok) {
    return authErrorResponse(auth);
  }

  const supabase = await getStudySupabaseClient(auth);
  const result = await getStudyStatus(supabase, auth.userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(result.data, { status: 200, headers: NO_STORE_HEADERS });
}
