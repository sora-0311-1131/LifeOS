import { NextResponse } from 'next/server';
import { parseJsonObject } from '@/lib/study/admin-validation';
import {
  authErrorResponse,
  getStudySupabaseClient,
  resolveStudyAuth,
} from '@/lib/study/auth';
import { parseSyncEvents, syncStudyEvents } from '@/lib/study/study-sync';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await resolveStudyAuth(request, { requiredScope: 'study:write' });
  if (!auth.ok) {
    return authErrorResponse(auth);
  }

  const bodyResult = await parseJsonObject(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: bodyResult.error },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const eventsResult = parseSyncEvents(bodyResult.data.events);
  if (!eventsResult.ok) {
    return NextResponse.json(
      { error: eventsResult.error },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const supabase = await getStudySupabaseClient(auth);
  const response = await syncStudyEvents(supabase, auth.userId, eventsResult.events);
  return NextResponse.json(response, { status: 200, headers: NO_STORE_HEADERS });
}
