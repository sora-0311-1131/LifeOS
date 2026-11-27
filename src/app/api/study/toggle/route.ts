import { NextResponse } from 'next/server';
import {
  authErrorResponse,
  getStudySupabaseClient,
  resolveStudyAuth,
} from '@/lib/study/auth';
import {
  getStudyStatus,
  parseOptionalString,
  startStudySession,
  stopStudySession,
} from '@/lib/study/study-service';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

/**
 * Single-call toggle endpoint for NFC tags / iOS Shortcuts.
 * - Studying now  -> stops the active session.
 * - Not studying  -> starts a session with `category_id` (query) or the last used category.
 * Optional query params: `tag_id`, `category_id`, `goal_id`, `project_id`, `task_id`.
 * No request body is required. Response includes a ready-to-display `message`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await resolveStudyAuth(request, { requiredScope: 'study:write' });
  if (!auth.ok) {
    return authErrorResponse(auth);
  }

  const url = new URL(request.url);
  const tagId = parseOptionalString(url.searchParams.get('tag_id')) ?? null;
  const requestedCategoryId = parseOptionalString(url.searchParams.get('category_id')) ?? null;
  const goalId = parseOptionalString(url.searchParams.get('goal_id')) ?? null;
  const projectId = parseOptionalString(url.searchParams.get('project_id')) ?? null;
  const taskId = parseOptionalString(url.searchParams.get('task_id')) ?? null;

  const supabase = await getStudySupabaseClient(auth);
  const status = await getStudyStatus(supabase, auth.userId);
  if (!status.ok) {
    return NextResponse.json(
      { error: status.error },
      { status: status.status, headers: NO_STORE_HEADERS }
    );
  }

  if (status.data.is_active) {
    const stopped = await stopStudySession(supabase, auth.userId, {});
    if (!stopped.ok) {
      return NextResponse.json(
        { error: stopped.error },
        { status: stopped.status, headers: NO_STORE_HEADERS }
      );
    }
    const { duration_min, today_total_min, category_name } = stopped.data;
    return NextResponse.json(
      {
        action: 'stopped',
        message: `お疲れ様！${category_name}を${duration_min}分集中しました（今日合計 ${today_total_min}分）`,
        ...stopped.data,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  const categoryId = requestedCategoryId ?? status.data.last_category?.id ?? null;
  if (!categoryId) {
    return NextResponse.json(
      { error: 'No category available. Create a category in /study first.' },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  const started = await startStudySession(supabase, auth.userId, {
    category_id: categoryId,
    tag_id: tagId,
    goal_id: goalId,
    project_id: projectId,
    task_id: taskId,
  });
  if (!started.ok) {
    return NextResponse.json(
      { error: started.error },
      { status: started.status, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      action: 'started',
      message: `開始しました：${started.data.category_name}`,
      ...started.data,
    },
    { status: started.data.already_exists ? 200 : 201, headers: NO_STORE_HEADERS }
  );
}
