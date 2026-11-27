import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockResolveStudyAuth = vi.fn();
const mockGetStudySupabaseClient = vi.fn();
const mockGetStudyStatus = vi.fn();
const mockStartStudySession = vi.fn();
const mockStopStudySession = vi.fn();
const mockSyncStudyEvents = vi.fn();

vi.mock('@/lib/study/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/study/auth')>('@/lib/study/auth');
  return {
    ...actual,
    resolveStudyAuth: (...args: unknown[]) => mockResolveStudyAuth(...args),
    getStudySupabaseClient: (...args: unknown[]) => mockGetStudySupabaseClient(...args),
  };
});

vi.mock('@/lib/study/study-service', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/study/study-service')>('@/lib/study/study-service');
  return {
    ...actual,
    getStudyStatus: (...args: unknown[]) => mockGetStudyStatus(...args),
    startStudySession: (...args: unknown[]) => mockStartStudySession(...args),
    stopStudySession: (...args: unknown[]) => mockStopStudySession(...args),
  };
});

vi.mock('@/lib/study/study-sync', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/study/study-sync')>('@/lib/study/study-sync');
  return {
    ...actual,
    syncStudyEvents: (...args: unknown[]) => mockSyncStudyEvents(...args),
  };
});

import { GET as getStatus } from '../status/route';
import { POST as postStart } from '../start/route';
import { POST as postStop } from '../stop/route';
import { POST as postToggle } from '../toggle/route';
import { POST as postSync } from '../sync/route';

const AUTH_OK = { ok: true as const, userId: 'user-1', method: 'bearer' as const };
const AUTH_401 = { ok: false as const, status: 401 as const, error: 'Unauthorized' };
const FAKE_SUPABASE = { fake: true };

describe('Study punch & sync API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStudySupabaseClient.mockResolvedValue(FAKE_SUPABASE);
  });

  it('returns 401 JSON on unauthenticated requests across all 5 endpoints', async () => {
    mockResolveStudyAuth.mockResolvedValue(AUTH_401);

    expect((await getStatus(new Request('http://localhost/api/study/status'))).status).toBe(401);
    expect(
      (
        await postStart(
          new Request('http://localhost/api/study/start', {
            method: 'POST',
            body: JSON.stringify({ category_name: '英語' }),
          })
        )
      ).status
    ).toBe(401);
    expect(
      (await postStop(new Request('http://localhost/api/study/stop', { method: 'POST' }))).status
    ).toBe(401);
    expect(
      (await postToggle(new Request('http://localhost/api/study/toggle', { method: 'POST' })))
        .status
    ).toBe(401);
    expect(
      (
        await postSync(
          new Request('http://localhost/api/study/sync', {
            method: 'POST',
            body: JSON.stringify({ events: [] }),
          })
        )
      ).status
    ).toBe(401);
  });

  it('GET /api/study/status returns status payload for authenticated user', async () => {
    mockResolveStudyAuth.mockResolvedValue(AUTH_OK);
    mockGetStudyStatus.mockResolvedValue({
      ok: true,
      data: { is_active: false, last_category: null, categories: [] },
    });

    const res = await getStatus(new Request('http://localhost/api/study/status'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ is_active: false, last_category: null, categories: [] });
    expect(mockGetStudyStatus).toHaveBeenCalledWith(FAKE_SUPABASE, 'user-1');
  });

  it('POST /api/study/start validates coordinates and forwards Plan x Actual IDs', async () => {
    mockResolveStudyAuth.mockResolvedValue(AUTH_OK);

    const badCoords = await postStart(
      new Request('http://localhost/api/study/start', {
        method: 'POST',
        body: JSON.stringify({ category_name: '英語', latitude: 35.0 }),
      })
    );
    expect(badCoords.status).toBe(400);

    mockStartStudySession.mockResolvedValue({
      ok: true,
      data: {
        status: 'started',
        already_exists: false,
        session_id: 's-1',
        category_id: 'c-1',
        category_name: '英語',
        location_label: 'Home',
        started_at: '2026-11-27T10:00:00.000Z',
        goal_id: 'g-1',
        project_id: 'p-1',
        task_id: 't-1',
      },
    });

    const res = await postStart(
      new Request('http://localhost/api/study/start', {
        method: 'POST',
        body: JSON.stringify({
          category_id: 'c-1',
          goal_id: 'g-1',
          project_id: 'p-1',
          task_id: 't-1',
        }),
      })
    );
    expect(res.status).toBe(201);
    expect(mockStartStudySession).toHaveBeenCalledWith(
      FAKE_SUPABASE,
      'user-1',
      expect.objectContaining({
        category_id: 'c-1',
        goal_id: 'g-1',
        project_id: 'p-1',
        task_id: 't-1',
      })
    );
  });

  it('POST /api/study/stop accepts empty body and returns stopped payload', async () => {
    mockResolveStudyAuth.mockResolvedValue(AUTH_OK);
    mockStopStudySession.mockResolvedValue({
      ok: true,
      data: {
        status: 'stopped',
        already_exists: false,
        session_id: 's-1',
        category_name: '英語',
        duration_sec: 1800,
        duration_min: 30,
        today_total_min: 60,
      },
    });

    const res = await postStop(new Request('http://localhost/api/study/stop', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'stopped', duration_min: 30 });
  });

  it('POST /api/study/toggle stops when active and starts when idle', async () => {
    mockResolveStudyAuth.mockResolvedValue(AUTH_OK);
    mockGetStudyStatus.mockResolvedValueOnce({
      ok: true,
      data: {
        is_active: true,
        active_session: {
          id: 's-1',
          category_id: 'c-1',
          category_name: '英語',
          started_at: '2026-11-27T10:00:00.000Z',
          goal_id: null,
          project_id: null,
          task_id: null,
        },
      },
    });
    mockStopStudySession.mockResolvedValueOnce({
      ok: true,
      data: {
        status: 'stopped',
        already_exists: false,
        session_id: 's-1',
        category_name: '英語',
        duration_sec: 1200,
        duration_min: 20,
        today_total_min: 50,
      },
    });

    const stopRes = await postToggle(
      new Request('http://localhost/api/study/toggle', { method: 'POST' })
    );
    expect(stopRes.status).toBe(200);
    expect(await stopRes.json()).toMatchObject({ action: 'stopped' });

    mockGetStudyStatus.mockResolvedValueOnce({
      ok: true,
      data: {
        is_active: false,
        last_category: { id: 'c-1', name: '英語' },
        categories: [{ id: 'c-1', name: '英語', color: '#8B5CF6' }],
      },
    });
    mockStartStudySession.mockResolvedValueOnce({
      ok: true,
      data: {
        status: 'started',
        already_exists: false,
        session_id: 's-2',
        category_id: 'c-1',
        category_name: '英語',
        location_label: 'Other',
        started_at: '2026-11-27T11:00:00.000Z',
        goal_id: null,
        project_id: null,
        task_id: null,
      },
    });

    const startRes = await postToggle(
      new Request('http://localhost/api/study/toggle?tag_id=nfc-desk', { method: 'POST' })
    );
    expect(startRes.status).toBe(201);
    expect(await startRes.json()).toMatchObject({ action: 'started', session_id: 's-2' });
    expect(mockStartStudySession).toHaveBeenCalledWith(
      FAKE_SUPABASE,
      'user-1',
      expect.objectContaining({ category_id: 'c-1', tag_id: 'nfc-desk' })
    );
  });

  it('POST /api/study/sync validates events array and delegates to syncStudyEvents', async () => {
    mockResolveStudyAuth.mockResolvedValue(AUTH_OK);

    const invalid = await postSync(
      new Request('http://localhost/api/study/sync', {
        method: 'POST',
        body: JSON.stringify({ events: 'bad' }),
      })
    );
    expect(invalid.status).toBe(400);

    mockSyncStudyEvents.mockResolvedValue({
      processed_event_ids: ['e1'],
      results: [{ client_event_id: 'e1', type: 'stop', outcome: 'skipped_no_active' }],
    });

    const okRes = await postSync(
      new Request('http://localhost/api/study/sync', {
        method: 'POST',
        body: JSON.stringify({
          events: [{ client_event_id: 'e1', type: 'stop', occurred_at: '2026-11-27T10:00:00Z' }],
        }),
      })
    );
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toMatchObject({ processed_event_ids: ['e1'] });
  });
});
