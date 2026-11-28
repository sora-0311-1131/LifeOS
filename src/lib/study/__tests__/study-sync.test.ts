import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStartStudySession = vi.fn();
const mockStopStudySession = vi.fn();

vi.mock('../study-service', async () => {
  const actual = await vi.importActual<typeof import('../study-service')>('../study-service');
  return {
    ...actual,
    startStudySession: (...args: unknown[]) => mockStartStudySession(...args),
    stopStudySession: (...args: unknown[]) => mockStopStudySession(...args),
  };
});

import { parseSyncEvents, syncStudyEvents } from '../study-sync';

const TEST_USER_ID = 'user-sync-1';

describe('parseSyncEvents', () => {
  it('validates event structure and optional Plan x Actual fields', () => {
    expect(parseSyncEvents('not-array').ok).toBe(false);
    expect(
      parseSyncEvents([
        { client_event_id: 'e1', type: 'start', occurred_at: '2026-11-25T09:00:00Z' },
      ]).ok
    ).toBe(false);

    const parsed = parseSyncEvents([
      {
        client_event_id: 'e1',
        type: 'start',
        category_name: '英語',
        task_id: 'task-1',
        occurred_at: '2026-11-25T09:00:00Z',
        latitude: 35.0,
        longitude: 135.7,
      },
      {
        client_event_id: 'e2',
        type: 'stop',
        occurred_at: '2026-11-25T09:45:00Z',
      },
    ]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.events[0].type === 'start') {
      expect(parsed.events[0].task_id).toBe('task-1');
    }
  });
});

describe('syncStudyEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('orders events chronologically, auto-closes conflicting active session with needs_review=true, and skips stale weather', async () => {
    const updatedPayloads: Array<Record<string, unknown>> = [];
    const callOrder: string[] = [];

    const fakeSupabase = {
      from: (table: string) => {
        if (table === 'study_categories') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'cat-1',
                      user_id: TEST_USER_ID,
                      name: '英語',
                      color: '#8B5CF6',
                      sort_order: 4,
                      is_archived: false,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table !== 'study_sessions') {
          throw new Error(`Unexpected table ${table}`);
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
              is: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'prev-active',
                    started_at: '2026-11-25T07:00:00.000Z',
                    needs_review: false,
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updatedPayloads.push(payload);
            return {
              eq: () => ({
                eq: () => ({
                  is: async () => ({ error: null }),
                }),
              }),
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    mockStartStudySession.mockImplementationOnce(async (_sb, userId, input) => {
      callOrder.push(
        `start:${userId}:${input.client_event_id}:skipWeather=${String(input.skip_weather)}`
      );
      return {
        ok: true,
        data: {
          status: 'started',
          already_exists: false,
          session_id: 'new-sess',
          category_id: 'cat-1',
          category_name: '英語',
          location_label: 'Home',
          started_at: input.occurred_at.toISOString(),
          goal_id: null,
          project_id: null,
          task_id: null,
        },
      };
    });

    mockStopStudySession.mockImplementationOnce(async (_sb, userId, input) => {
      callOrder.push(`stop:${userId}:${input.client_event_id}`);
      return {
        ok: true,
        data: {
          status: 'stopped',
          already_exists: false,
          session_id: 'new-sess',
          category_name: '英語',
          duration_sec: 1800,
          duration_min: 30,
          today_total_min: 90,
        },
      };
    });

    const parsed = parseSyncEvents([
      {
        client_event_id: 'evt-2',
        type: 'stop',
        occurred_at: '2026-11-25T08:30:00.000Z',
      },
      {
        client_event_id: 'evt-1',
        type: 'start',
        category_name: '英語',
        occurred_at: '2026-11-25T08:00:00.000Z',
      },
    ]);
    if (!parsed.ok) throw new Error(parsed.error);

    const result = await syncStudyEvents(
      fakeSupabase,
      TEST_USER_ID,
      parsed.events,
      new Date('2026-11-25T10:00:00.000Z')
    );

    expect(callOrder).toEqual([
      `start:${TEST_USER_ID}:evt-1:skipWeather=true`,
      `stop:${TEST_USER_ID}:evt-2`,
    ]);
    expect(updatedPayloads).toHaveLength(1);
    expect(updatedPayloads[0]).toMatchObject({
      ended_at: '2026-11-25T08:00:00.000Z',
      duration_sec: 3600,
      needs_review: true,
    });
    expect(result.processed_event_ids).toEqual(['evt-1', 'evt-2']);
    expect(result.results[0]).toMatchObject({
      client_event_id: 'evt-1',
      outcome: 'applied_with_conflict_close',
      closed_conflict_session_id: 'prev-active',
      session_id: 'new-sess',
    });
    expect(result.results[1]).toMatchObject({
      client_event_id: 'evt-2',
      outcome: 'applied',
    });
  });

  it('marks already-applied start events as already_exists without closing active session', async () => {
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'existing-sess' }, error: null }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const parsed = parseSyncEvents([
      {
        client_event_id: 'evt-dup',
        type: 'start',
        category_name: '英語',
        occurred_at: '2026-11-25T09:00:00.000Z',
      },
    ]);
    if (!parsed.ok) throw new Error(parsed.error);

    const result = await syncStudyEvents(fakeSupabase, TEST_USER_ID, parsed.events);
    expect(result.processed_event_ids).toEqual(['evt-dup']);
    expect(result.results[0]).toMatchObject({
      outcome: 'already_exists',
      session_id: 'existing-sess',
    });
    expect(mockStartStudySession).not.toHaveBeenCalled();
  });

  it('does not close active session when start event references a nonexistent category', async () => {
    const updateSpy = vi.fn();
    const fakeSupabase = {
      from: (table: string) => {
        if (table === 'study_categories') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
              is: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'active-keep',
                    started_at: '2026-11-25T07:00:00.000Z',
                    needs_review: false,
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: updateSpy,
        };
      },
    } as unknown as SupabaseClient;

    const parsed = parseSyncEvents([
      {
        client_event_id: 'evt-bad-cat',
        type: 'start',
        category_name: '削除済みカテゴリ',
        occurred_at: '2026-11-25T09:00:00.000Z',
      },
    ]);
    if (!parsed.ok) throw new Error(parsed.error);

    const result = await syncStudyEvents(fakeSupabase, TEST_USER_ID, parsed.events);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(mockStartStudySession).not.toHaveBeenCalled();
    expect(result.processed_event_ids).toEqual([]);
    expect(result.results[0]).toMatchObject({
      client_event_id: 'evt-bad-cat',
      outcome: 'error',
    });
  });

  it('clears a stop event that predates the currently active (newer) session instead of retrying forever', async () => {
    mockStopStudySession.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: 'occurred_at cannot be earlier than the session started_at.',
      code: 'stop_before_start',
    });
    mockStopStudySession.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: 'Failed to stop study session.',
    });

    const parsed = parseSyncEvents([
      { client_event_id: 'evt-old-stop', type: 'stop', occurred_at: '2026-11-25T08:00:00.000Z' },
      { client_event_id: 'evt-fail-stop', type: 'stop', occurred_at: '2026-11-25T08:30:00.000Z' },
    ]);
    if (!parsed.ok) throw new Error(parsed.error);

    const result = await syncStudyEvents({} as SupabaseClient, TEST_USER_ID, parsed.events);
    expect(result.processed_event_ids).toEqual(['evt-old-stop']);
    expect(result.results[0]).toMatchObject({
      client_event_id: 'evt-old-stop',
      outcome: 'skipped_no_active',
    });
    // Genuine server failures must stay unprocessed so the client retries them later
    expect(result.results[1]).toMatchObject({ client_event_id: 'evt-fail-stop', outcome: 'error' });
  });

  it('applies far-future events at server time while keeping client ordering', async () => {
    const now = new Date('2026-11-27T10:00:00.000Z');
    // study_categories resolves the category; study_sessions has no prior event and no active row
    const fakeSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () =>
                table === 'study_categories'
                  ? { data: { id: 'cat-1', name: '英語' }, error: null }
                  : { data: null, error: null },
            }),
            is: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    mockStartStudySession.mockResolvedValueOnce({
      ok: true,
      data: { already_exists: false, session_id: 'sess-future' },
    });
    mockStopStudySession.mockResolvedValueOnce({
      ok: true,
      data: { already_exists: false, session_id: 'sess-future' },
    });

    // Device clock ~1 day fast: both timestamps are far in the future
    const parsed = parseSyncEvents([
      { client_event_id: 'evt-f-stop', type: 'stop', occurred_at: '2026-11-28T11:00:00.000Z' },
      {
        client_event_id: 'evt-f-start',
        type: 'start',
        category_id: 'cat-1',
        occurred_at: '2026-11-28T10:00:00.000Z',
      },
    ]);
    if (!parsed.ok) throw new Error(parsed.error);

    const result = await syncStudyEvents(fakeSupabase, TEST_USER_ID, parsed.events, now);
    expect(result.processed_event_ids).toEqual(['evt-f-start', 'evt-f-stop']);
    expect(mockStartStudySession).toHaveBeenCalledWith(
      fakeSupabase,
      TEST_USER_ID,
      expect.objectContaining({ client_event_id: 'evt-f-start', occurred_at: now })
    );
    expect(mockStopStudySession).toHaveBeenCalledWith(
      fakeSupabase,
      TEST_USER_ID,
      expect.objectContaining({ client_event_id: 'evt-f-stop', occurred_at: now })
    );
  });
});
