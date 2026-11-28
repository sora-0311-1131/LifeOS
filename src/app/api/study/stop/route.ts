import { NextResponse } from 'next/server';
import {
  authErrorResponse,
  getStudySupabaseClient,
  resolveStudyAuth,
} from '@/lib/study/auth';
import {
  parseOccurredAt,
  parseOptionalString,
  stopStudySession,
} from '@/lib/study/study-service';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await resolveStudyAuth(request, { requiredScope: 'study:write' });
  if (!auth.ok) {
    return authErrorResponse(auth);
  }

  let body: Record<string, unknown> = {};
  const rawText = await request.text();
  if (rawText.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: 'Request body must be a JSON object.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
  }

  const occurredResult = parseOccurredAt(body.occurred_at);
  if (!occurredResult.ok) {
    return NextResponse.json(
      { error: occurredResult.error },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const supabase = await getStudySupabaseClient(auth);
  const result = await stopStudySession(supabase, auth.userId, {
    client_event_id: parseOptionalString(body.client_event_id) ?? null,
    occurred_at: occurredResult.date,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(result.data, { status: 200, headers: NO_STORE_HEADERS });
}
