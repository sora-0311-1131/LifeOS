import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_UNIV_PERIODS,
  type StudyCategoryRow,
  type StudySessionRow,
  type StudySettingsRow,
  type StudySpotRow,
} from '@/types/study';
import { parseUnivPeriodsOrDefault } from './admin-validation';
import { findMatchingSpot, isValidCoordinate } from './geo';
import {
  getDayType,
  getLogicalDateJst,
  getLogicalDayBoundsUtc,
  getUnivPeriod,
} from './time';
import { fetchWeatherSnapshot } from './weather';

export function getDefaultStudySettings(userId: string): StudySettingsRow {
  return {
    user_id: userId,
    day_boundary_hour: 4,
    streak_min_minutes: 30,
    daily_goal_weekday_min: 180,
    daily_goal_weekend_min: 360,
    long_session_warn_min: 360,
    univ_periods: DEFAULT_UNIV_PERIODS,
    updated_at: new Date(0).toISOString(),
  };
}

export interface StudyServiceError {
  ok: false;
  status: number;
  error: string;
  /** Machine-readable reason for callers that need to branch on a specific failure. */
  code?: 'stop_before_start';
}

export type ServiceResult<T> = ({ ok: true } & T) | StudyServiceError;

export function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** How far in the future a client-supplied `occurred_at` may be (tolerates small clock skew). */
export const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;

/**
 * Parses an optional ISO 8601 `occurred_at` (defaults to `now`).
 * Rejects timestamps more than `MAX_FUTURE_SKEW_MS` ahead of `now`: a future `started_at` would
 * make a normal stop fail ("earlier than started_at") and leave an unstoppable session.
 * Pass `allowFuture: true` where the caller clamps future timestamps itself (offline sync).
 */
export function parseOccurredAt(
  value: unknown,
  options: { now?: Date; allowFuture?: boolean } = {}
): { ok: true; date: Date } | { ok: false; error: string } {
  const now = options.now ?? new Date();
  if (value === undefined || value === null || value === '') {
    return { ok: true, date: now };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: 'occurred_at must be an ISO 8601 timestamp string.' };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'occurred_at is not a valid timestamp.' };
  }
  if (!options.allowFuture && date.getTime() - now.getTime() > MAX_FUTURE_SKEW_MS) {
    return {
      ok: false,
      error: 'occurred_at is too far in the future. Check the device clock.',
    };
  }
  return { ok: true, date };
}

export function parseCoordinates(
  latitude: unknown,
  longitude: unknown
):
  | { ok: true; latitude: number | null; longitude: number | null }
  | { ok: false; error: string } {
  const hasLat = latitude !== undefined && latitude !== null && latitude !== '';
  const hasLng = longitude !== undefined && longitude !== null && longitude !== '';

  if (!hasLat && !hasLng) {
    return { ok: true, latitude: null, longitude: null };
  }
  if (hasLat !== hasLng) {
    return { ok: false, error: 'Both latitude and longitude must be provided together.' };
  }

  const latNum = typeof latitude === 'number' ? latitude : Number(latitude);
  const lngNum = typeof longitude === 'number' ? longitude : Number(longitude);

  if (!isValidCoordinate(latNum, lngNum)) {
    return { ok: false, error: 'latitude/longitude values are out of valid WGS84 range.' };
  }

  return { ok: true, latitude: latNum, longitude: lngNum };
}

export async function getStudySettings(
  supabase: SupabaseClient,
  userId: string
): Promise<StudySettingsRow> {
  const { data, error } = await supabase
    .from('study_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return getDefaultStudySettings(userId);
  }

  const row = data as StudySettingsRow;
  return {
    ...row,
    univ_periods: parseUnivPeriodsOrDefault(row.univ_periods),
  };
}

export async function resolveCategory(
  supabase: SupabaseClient,
  userId: string,
  input: { category_id?: string | null; category_name?: string | null }
): Promise<StudyCategoryRow | null> {
  if (input.category_id) {
    const { data } = await supabase
      .from('study_categories')
      .select('*')
      .eq('user_id', userId)
      .eq('id', input.category_id)
      .maybeSingle();
    if (data) return data as StudyCategoryRow;
  }

  if (input.category_name) {
    const { data } = await supabase
      .from('study_categories')
      .select('*')
      .eq('user_id', userId)
      .eq('name', input.category_name)
      .maybeSingle();
    if (data) return data as StudyCategoryRow;
  }

  return null;
}

/**
 * Verifies that optional Plan x Actual foreign key targets (`goal_id`, `project_id`, `task_id`)
 * exist and belong to `userId`. Prevents cross-user reference injection even when RLS is bypassed.
 */
export async function verifyPlanEntityOwnership(
  supabase: SupabaseClient,
  userId: string,
  refs: {
    goal_id?: string | null;
    project_id?: string | null;
    task_id?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const checks: Array<Promise<{ label: string; valid: boolean }>> = [];

  if (refs.goal_id) {
    checks.push(
      Promise.resolve(
        supabase
          .from('goals')
          .select('id')
          .eq('id', refs.goal_id)
          .eq('user_id', userId)
          .maybeSingle()
      ).then(({ data, error }) => ({ label: 'goal_id', valid: !error && Boolean(data) }))
    );
  }

  if (refs.project_id) {
    checks.push(
      Promise.resolve(
        supabase
          .from('projects')
          .select('id')
          .eq('id', refs.project_id)
          .eq('user_id', userId)
          .maybeSingle()
      ).then(({ data, error }) => ({ label: 'project_id', valid: !error && Boolean(data) }))
    );
  }

  if (refs.task_id) {
    checks.push(
      Promise.resolve(
        supabase
          .from('tasks')
          .select('id')
          .eq('id', refs.task_id)
          .eq('user_id', userId)
          .maybeSingle()
      ).then(({ data, error }) => ({ label: 'task_id', valid: !error && Boolean(data) }))
    );
  }

  if (checks.length === 0) {
    return { ok: true };
  }

  const results = await Promise.all(checks);
  const invalid = results.find((r) => !r.valid);
  if (invalid) {
    return { ok: false, error: `Invalid or inaccessible ${invalid.label}.` };
  }

  return { ok: true };
}

async function computeTodayTotalMinutes(
  supabase: SupabaseClient,
  userId: string,
  referenceDate: Date,
  dayBoundaryHour: number
): Promise<number> {
  const logicalDate = getLogicalDateJst(referenceDate, dayBoundaryHour);
  const { startIso, endIso } = getLogicalDayBoundsUtc(logicalDate, dayBoundaryHour);

  const { data, error } = await supabase
    .from('study_sessions')
    .select('duration_sec')
    .eq('user_id', userId)
    .gte('started_at', startIso)
    .lt('started_at', endIso)
    .not('duration_sec', 'is', null);

  if (error || !data) {
    return 0;
  }

  const totalSec = data.reduce((sum, row) => sum + (Number(row.duration_sec) || 0), 0);
  return Math.round(totalSec / 60);
}

export interface StudyStatusActive {
  is_active: true;
  active_session: {
    id: string;
    category_id: string;
    category_name: string;
    started_at: string;
    goal_id: string | null;
    project_id: string | null;
    task_id: string | null;
  };
}

export interface StudyStatusIdle {
  is_active: false;
  last_category: { id: string; name: string } | null;
  categories: Array<{ id: string; name: string; color: string }>;
}

export async function getStudyStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<ServiceResult<{ data: StudyStatusActive | StudyStatusIdle }>> {
  const { data: activeRow, error: activeError } = await supabase
    .from('study_sessions')
    .select('id, category_id, started_at, goal_id, project_id, task_id')
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle();

  if (activeError) {
    return { ok: false, status: 500, error: 'Failed to query active study session.' };
  }

  if (activeRow) {
    const { data: cat } = await supabase
      .from('study_categories')
      .select('name')
      .eq('user_id', userId)
      .eq('id', activeRow.category_id)
      .maybeSingle();

    return {
      ok: true,
      data: {
        is_active: true,
        active_session: {
          id: activeRow.id,
          category_id: activeRow.category_id,
          category_name: cat?.name ?? 'Unknown',
          started_at: activeRow.started_at,
          goal_id: activeRow.goal_id ?? null,
          project_id: activeRow.project_id ?? null,
          task_id: activeRow.task_id ?? null,
        },
      },
    };
  }

  const [{ data: categories, error: catError }, { data: lastSession }] = await Promise.all([
    supabase
      .from('study_categories')
      .select('id, name, color')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('study_sessions')
      .select('category_id')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (catError) {
    return { ok: false, status: 500, error: 'Failed to load categories.' };
  }

  const activeCategories = (categories ?? []) as Array<{
    id: string;
    name: string;
    color: string;
  }>;

  let lastCategory: { id: string; name: string } | null = null;
  if (lastSession?.category_id) {
    const matched = activeCategories.find((c) => c.id === lastSession.category_id);
    if (matched) {
      lastCategory = { id: matched.id, name: matched.name };
    }
  }
  if (!lastCategory && activeCategories.length > 0) {
    lastCategory = { id: activeCategories[0].id, name: activeCategories[0].name };
  }

  return {
    ok: true,
    data: {
      is_active: false,
      last_category: lastCategory,
      categories: activeCategories,
    },
  };
}

export interface StartStudyInput {
  client_event_id?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  goal_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  memo?: string | null;
  tag_id?: string | null;
  wifi_ssid?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  occurred_at?: Date;
  skip_weather?: boolean;
}

export interface StartStudyResponse {
  status: 'started';
  already_exists: boolean;
  session_id: string;
  category_id: string;
  category_name: string;
  location_label: string;
  started_at: string;
  goal_id: string | null;
  project_id: string | null;
  task_id: string | null;
}

export async function startStudySession(
  supabase: SupabaseClient,
  userId: string,
  input: StartStudyInput
): Promise<ServiceResult<{ data: StartStudyResponse }>> {
  // 1. Idempotency check by (user_id, start_event_id)
  if (input.client_event_id) {
    const { data: existing } = await supabase
      .from('study_sessions')
      .select('id, category_id, location_label, started_at, goal_id, project_id, task_id')
      .eq('user_id', userId)
      .eq('start_event_id', input.client_event_id)
      .maybeSingle();

    if (existing) {
      const { data: cat } = await supabase
        .from('study_categories')
        .select('name')
        .eq('user_id', userId)
        .eq('id', existing.category_id)
        .maybeSingle();

      return {
        ok: true,
        data: {
          status: 'started',
          already_exists: true,
          session_id: existing.id,
          category_id: existing.category_id,
          category_name: cat?.name ?? 'Unknown',
          location_label: existing.location_label,
          started_at: existing.started_at,
          goal_id: existing.goal_id ?? null,
          project_id: existing.project_id ?? null,
          task_id: existing.task_id ?? null,
        },
      };
    }
  }

  // 2. Check if another session is currently active for this user
  const { data: activeRow, error: activeError } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle();

  if (activeError) {
    return { ok: false, status: 500, error: 'Failed to check active session.' };
  }
  if (activeRow) {
    return { ok: false, status: 409, error: 'A study session is already active.' };
  }

  // 3. Resolve category (owned by userId) and verify optional Plan x Actual links
  const [category, ownership] = await Promise.all([
    resolveCategory(supabase, userId, {
      category_id: input.category_id,
      category_name: input.category_name,
    }),
    verifyPlanEntityOwnership(supabase, userId, {
      goal_id: input.goal_id,
      project_id: input.project_id,
      task_id: input.task_id,
    }),
  ]);

  if (!category) {
    return {
      ok: false,
      status: 400,
      error: 'Valid category_id or category_name is required.',
    };
  }
  if (!ownership.ok) {
    return {
      ok: false,
      status: 400,
      error: ownership.error,
    };
  }

  // 4. Server-side enrichment (settings, nested spot match, non-blocking weather)
  const startedAt = input.occurred_at ?? new Date();
  const [settings, spotsResult, weather] = await Promise.all([
    getStudySettings(supabase, userId),
    supabase.from('study_spots').select('*').eq('user_id', userId),
    input.skip_weather
      ? Promise.resolve(null)
      : fetchWeatherSnapshot(input.latitude ?? null, input.longitude ?? null),
  ]);

  const spots = (spotsResult.data ?? []) as StudySpotRow[];
  const spotMatch = findMatchingSpot(
    input.latitude ?? null,
    input.longitude ?? null,
    spots,
    input.wifi_ssid ?? null
  );

  const dayType = getDayType(startedAt, settings.day_boundary_hour);
  const univPeriod = getUnivPeriod(startedAt, settings.univ_periods);

  const { data: inserted, error: insertError } = await supabase
    .from('study_sessions')
    .insert({
      user_id: userId,
      category_id: category.id,
      spot_id: spotMatch?.spot.id ?? null,
      goal_id: input.goal_id ?? null,
      project_id: input.project_id ?? null,
      task_id: input.task_id ?? null,
      location_label: spotMatch?.spot.name ?? 'Other',
      memo: input.memo ?? null,
      tag_id: input.tag_id ?? null,
      wifi_ssid: input.wifi_ssid ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      weather_code: weather?.weather_code ?? null,
      temperature_c: weather?.temperature_c ?? null,
      pressure_hpa: weather?.pressure_hpa ?? null,
      pressure_diff_3h: weather?.pressure_diff_3h ?? null,
      pressure_diff_6h: weather?.pressure_diff_6h ?? null,
      day_type: dayType,
      univ_period: univPeriod,
      start_event_id: input.client_event_id ?? null,
      started_at: startedAt.toISOString(),
    })
    .select('id, category_id, location_label, started_at, goal_id, project_id, task_id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      // Handle race on idempotency key vs single active session constraint
      if (input.client_event_id) {
        const { data: raced } = await supabase
          .from('study_sessions')
          .select('id, category_id, location_label, started_at, goal_id, project_id, task_id')
          .eq('user_id', userId)
          .eq('start_event_id', input.client_event_id)
          .maybeSingle();
        if (raced) {
          return {
            ok: true,
            data: {
              status: 'started',
              already_exists: true,
              session_id: raced.id,
              category_id: raced.category_id,
              category_name: category.name,
              location_label: raced.location_label,
              started_at: raced.started_at,
              goal_id: raced.goal_id ?? null,
              project_id: raced.project_id ?? null,
              task_id: raced.task_id ?? null,
            },
          };
        }
      }
      return { ok: false, status: 409, error: 'A study session is already active.' };
    }
    return { ok: false, status: 500, error: 'Failed to create study session.' };
  }

  return {
    ok: true,
    data: {
      status: 'started',
      already_exists: false,
      session_id: inserted.id,
      category_id: inserted.category_id,
      category_name: category.name,
      location_label: inserted.location_label,
      started_at: inserted.started_at,
      goal_id: inserted.goal_id ?? null,
      project_id: inserted.project_id ?? null,
      task_id: inserted.task_id ?? null,
    },
  };
}

export interface StopStudyInput {
  client_event_id?: string | null;
  occurred_at?: Date;
}

export interface StopStudyResponse {
  status: 'stopped';
  already_exists: boolean;
  session_id: string;
  category_name: string;
  duration_sec: number;
  duration_min: number;
  today_total_min: number;
}

async function findStoppedByEventId(
  supabase: SupabaseClient,
  userId: string,
  clientEventId: string,
  dayBoundaryHour: number,
  fallbackRefDate: Date
): Promise<StopStudyResponse | null> {
  const { data: existing } = await supabase
    .from('study_sessions')
    .select('id, category_id, duration_sec, ended_at')
    .eq('user_id', userId)
    .eq('stop_event_id', clientEventId)
    .maybeSingle();

  if (!existing) {
    return null;
  }

  const refDate = existing.ended_at ? new Date(existing.ended_at) : fallbackRefDate;
  const [{ data: cat }, todayTotalMin] = await Promise.all([
    supabase
      .from('study_categories')
      .select('name')
      .eq('user_id', userId)
      .eq('id', existing.category_id)
      .maybeSingle(),
    computeTodayTotalMinutes(supabase, userId, refDate, dayBoundaryHour),
  ]);
  const durationSec = existing.duration_sec ?? 0;

  return {
    status: 'stopped',
    already_exists: true,
    session_id: existing.id,
    category_name: cat?.name ?? 'Unknown',
    duration_sec: durationSec,
    duration_min: Math.round(durationSec / 60),
    today_total_min: todayTotalMin,
  };
}

export async function stopStudySession(
  supabase: SupabaseClient,
  userId: string,
  input: StopStudyInput
): Promise<ServiceResult<{ data: StopStudyResponse }>> {
  const settings = await getStudySettings(supabase, userId);
  const now = input.occurred_at ?? new Date();

  // 1. Idempotency check by (user_id, stop_event_id)
  if (input.client_event_id) {
    const existing = await findStoppedByEventId(
      supabase,
      userId,
      input.client_event_id,
      settings.day_boundary_hour,
      now
    );
    if (existing) {
      return { ok: true, data: existing };
    }
  }

  // 2. Find active session for this user
  const { data: activeRow, error: activeError } = await supabase
    .from('study_sessions')
    .select('*')
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle();

  if (activeError) {
    return { ok: false, status: 500, error: 'Failed to find active study session.' };
  }
  if (!activeRow) {
    return { ok: false, status: 404, error: 'No active study session found.' };
  }

  const session = activeRow as StudySessionRow;
  const startedAt = new Date(session.started_at);
  const endedAt = now;

  if (endedAt.getTime() < startedAt.getTime()) {
    return {
      ok: false,
      status: 400,
      error: 'occurred_at cannot be earlier than the session started_at.',
      code: 'stop_before_start',
    };
  }

  const durationSec = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

  const { data: updatedRow, error: updateError } = await supabase
    .from('study_sessions')
    .update({
      ended_at: endedAt.toISOString(),
      duration_sec: durationSec,
      stop_event_id: input.client_event_id ?? null,
    })
    .eq('id', session.id)
    .eq('user_id', userId)
    .is('ended_at', null)
    .select('id')
    .maybeSingle();

  if (updateError) {
    if (updateError.code === '23505' && input.client_event_id) {
      const raced = await findStoppedByEventId(
        supabase,
        userId,
        input.client_event_id,
        settings.day_boundary_hour,
        endedAt
      );
      if (raced) {
        return { ok: true, data: raced };
      }
    }
    return { ok: false, status: 500, error: 'Failed to stop study session.' };
  }

  if (!updatedRow) {
    // Concurrent duplicate stop with the same client_event_id may update 0 rows cleanly
    if (input.client_event_id) {
      const raced = await findStoppedByEventId(
        supabase,
        userId,
        input.client_event_id,
        settings.day_boundary_hour,
        endedAt
      );
      if (raced) {
        return { ok: true, data: raced };
      }
    }
    return { ok: false, status: 404, error: 'No active study session found.' };
  }

  const [{ data: cat }, todayTotalMin] = await Promise.all([
    supabase
      .from('study_categories')
      .select('name')
      .eq('user_id', userId)
      .eq('id', session.category_id)
      .maybeSingle(),
    computeTodayTotalMinutes(supabase, userId, endedAt, settings.day_boundary_hour),
  ]);

  return {
    ok: true,
    data: {
      status: 'stopped',
      already_exists: false,
      session_id: session.id,
      category_name: cat?.name ?? 'Unknown',
      duration_sec: durationSec,
      duration_min: Math.round(durationSec / 60),
      today_total_min: todayTotalMin,
    },
  };
}
