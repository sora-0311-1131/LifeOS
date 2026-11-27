import { describe, expect, it } from 'vitest';
import type { StudySessionRow } from '@/types/study';
import { buildDashboardSummary, type StudyCategorySummary } from '../dashboard-service';
import { getDefaultStudySettings } from '../study-service';

const USER_ID = 'user-1';

function makeSession(overrides: Partial<StudySessionRow>): StudySessionRow {
  return {
    id: 'sess-1',
    user_id: USER_ID,
    category_id: 'cat-1',
    spot_id: null,
    goal_id: null,
    project_id: null,
    task_id: null,
    location_label: 'Home',
    memo: 'note',
    tag_id: null,
    wifi_ssid: 'MyHomeWiFi',
    latitude: 35.0,
    longitude: 135.7,
    weather_code: 0,
    temperature_c: 18,
    pressure_hpa: 1013,
    pressure_diff_3h: 0,
    pressure_diff_6h: 0,
    day_type: 'weekday',
    univ_period: 'period_1',
    needs_review: false,
    start_event_id: null,
    stop_event_id: null,
    started_at: '2026-11-25T01:00:00.000Z',
    ended_at: '2026-11-25T02:00:00.000Z',
    duration_sec: 3600,
    created_at: '2026-11-25T01:00:00.000Z',
    ...overrides,
  };
}

describe('buildDashboardSummary', () => {
  it('aggregates today/week totals, streak, long session warning, and unified DTO fields', () => {
    const settings = getDefaultStudySettings(USER_ID);
    const categories: StudyCategorySummary[] = [
      { id: 'cat-1', name: '英語', color: '#8B5CF6', sort_order: 1, is_archived: false },
      { id: 'cat-2', name: '開発', color: '#10B981', sort_order: 2, is_archived: false },
    ];
    const now = new Date('2026-11-25T09:00:00.000Z'); // 18:00 JST

    const sessions: StudySessionRow[] = [
      makeSession({
        id: 'yesterday',
        category_id: 'cat-1',
        started_at: '2026-11-24T01:00:00.000Z',
        ended_at: '2026-11-24T02:00:00.000Z',
        duration_sec: 3600,
      }),
      makeSession({
        id: 'today-1',
        category_id: 'cat-2',
        task_id: 'task-99',
        location_label: '大学図書館',
        started_at: '2026-11-25T01:00:00.000Z',
        ended_at: '2026-11-25T02:00:00.000Z',
        duration_sec: 3600,
      }),
    ];

    const activeRow = makeSession({
      id: 'active-1',
      category_id: 'cat-1',
      started_at: '2026-11-25T02:30:00.000Z', // 6.5h ago -> exceeds 360m warn threshold
      ended_at: null,
      duration_sec: null,
    });

    const summary = buildDashboardSummary({
      sessions,
      activeRow,
      categories,
      settings,
      now,
    });

    expect(summary.today.logical_date).toBe('2026-11-25');
    expect(summary.today.completed_sec).toBe(3600);
    expect(summary.week.completed_sec).toBe(7200);
    expect(summary.streak_days).toBe(2);
    expect(summary.long_session_warning).toBe(true);
    expect(summary.active_session?.category_name).toBe('英語');
    expect(summary.recent_sessions[0]).toMatchObject({
      id: 'today-1',
      task_id: 'task-99',
      memo: 'note',
      wifi_ssid: 'MyHomeWiFi',
    });
    expect(summary.locations).toEqual(['Home', '大学図書館']);
  });
});
