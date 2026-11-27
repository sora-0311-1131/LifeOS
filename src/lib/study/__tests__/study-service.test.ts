import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  getDefaultStudySettings,
  startStudySession,
  stopStudySession,
  verifyPlanEntityOwnership,
} from '../study-service';

const TEST_USER_ID = 'user-123';

describe('study-service', () => {
  it('returns 200 already_exists when concurrent duplicate stop updates 0 rows', async () => {
    let stopEventLookupCount = 0;

    const fakeSupabase = {
      from: (table: string) => {
        if (table === 'study_settings') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: getDefaultStudySettings(TEST_USER_ID),
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'study_categories') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { name: '英語' }, error: null }),
                }),
              }),
            }),
          };
        }

        if (table === 'study_sessions') {
          return {
            select: (cols: string) => {
              if (cols === 'duration_sec') {
                return {
                  eq: () => ({
                    gte: () => ({
                      lt: () => ({
                        not: async () => ({ data: [{ duration_sec: 1800 }], error: null }),
                      }),
                    }),
                  }),
                };
              }
              return {
                eq: () => ({
                  eq: (col: string) => {
                    if (col === 'stop_event_id') {
                      return {
                        maybeSingle: async () => {
                          stopEventLookupCount += 1;
                          if (stopEventLookupCount === 1) {
                            return { data: null, error: null };
                          }
                          return {
                            data: {
                              id: 'sess-1',
                              category_id: 'cat-1',
                              duration_sec: 1800,
                              ended_at: '2026-11-25T10:30:00.000Z',
                            },
                            error: null,
                          };
                        },
                      };
                    }
                    return { maybeSingle: async () => ({ data: null, error: null }) };
                  },
                  is: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: 'sess-1',
                        user_id: TEST_USER_ID,
                        category_id: 'cat-1',
                        started_at: '2026-11-25T10:00:00.000Z',
                        ended_at: null,
                      },
                      error: null,
                    }),
                  }),
                }),
              };
            },
            update: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const result = await stopStudySession(fakeSupabase, TEST_USER_ID, {
      client_event_id: 'evt-stop-race',
      occurred_at: new Date('2026-11-25T10:30:00.000Z'),
    });

    expect(result).toEqual({
      ok: true,
      data: {
        status: 'stopped',
        already_exists: true,
        session_id: 'sess-1',
        category_name: '英語',
        duration_sec: 1800,
        duration_min: 30,
        today_total_min: 30,
      },
    });
    expect(stopEventLookupCount).toBe(2);
  });

  it('rejects startStudySession when an optional task_id belongs to another user', async () => {
    const fakeSupabase = {
      from: (table: string) => {
        if (table === 'study_sessions') {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            }),
          };
        }
        if (table === 'study_categories') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'cat-1', user_id: TEST_USER_ID, name: '英語', color: '#8B5CF6' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'tasks') {
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
        throw new Error(`Unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const result = await startStudySession(fakeSupabase, TEST_USER_ID, {
      category_id: 'cat-1',
      task_id: 'other-users-task-id',
      skip_weather: true,
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Invalid or inaccessible task_id.',
    });
  });

  it('verifyPlanEntityOwnership passes when all provided references belong to userId', async () => {
    const queriedTables: string[] = [];
    const fakeSupabase = {
      from: (table: string) => {
        queriedTables.push(table);
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: 'owned-id' }, error: null }),
              }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;

    const result = await verifyPlanEntityOwnership(fakeSupabase, TEST_USER_ID, {
      goal_id: 'g-1',
      project_id: 'p-1',
      task_id: 't-1',
    });

    expect(result).toEqual({ ok: true });
    expect(queriedTables.sort()).toEqual(['goals', 'projects', 'tasks']);
  });
});
