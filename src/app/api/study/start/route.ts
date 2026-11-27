import { NextResponse } from 'next/server';
import { parseJsonObject } from '@/lib/study/admin-validation';
import {
  authErrorResponse,
  getStudySupabaseClient,
  resolveStudyAuth,
} from '@/lib/study/auth';
import {
  parseCoordinates,
  parseOccurredAt,
  parseOptionalString,
  startStudySession,
} from '@/lib/study/study-service';

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
  const body = bodyResult.data;

  const occurredResult = parseOccurredAt(body.occurred_at);
  if (!occurredResult.ok) {
    return NextResponse.json(
      { error: occurredResult.error },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const coordsResult = parseCoordinates(body.latitude, body.longitude);
  if (!coordsResult.ok) {
    return NextResponse.json(
      { error: coordsResult.error },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const supabase = await getStudySupabaseClient(auth);
  const result = await startStudySession(supabase, auth.userId, {
    client_event_id: parseOptionalString(body.client_event_id) ?? null,
    category_id: parseOptionalString(body.category_id) ?? null,
    category_name: parseOptionalString(body.category_name) ?? null,
    goal_id: parseOptionalString(body.goal_id) ?? null,
    project_id: parseOptionalString(body.project_id) ?? null,
    task_id: parseOptionalString(body.task_id) ?? null,
    memo: parseOptionalString(body.memo) ?? null,
    tag_id: parseOptionalString(body.tag_id) ?? null,
    wifi_ssid: parseOptionalString(body.wifi_ssid) ?? null,
    latitude: coordsResult.latitude,
    longitude: coordsResult.longitude,
    occurred_at: occurredResult.date,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(result.data, {
    status: result.data.already_exists ? 200 : 201,
    headers: NO_STORE_HEADERS,
  });
}
