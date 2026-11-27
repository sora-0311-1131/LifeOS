import type { SupabaseClient } from '@supabase/supabase-js';
import {
  toStudySessionDto,
  type DayType,
  type StudyCategoryRow,
  type StudySessionDto,
  type StudySessionRow,
  type StudySettingsRow,
  type UnivPeriod,
} from '@/types/study';
import { getStudySettings } from './study-service';
import {
  addDaysToYmd,
  calculateStreak,
  getDayType,
  getLogicalDateJst,
  getLogicalDayBoundsUtc,
} from './time';

const PAGE_SIZE = 500;
const STREAK_CHUNK_DAYS = 365;

export type StudyCategorySummary = Pick<
  StudyCategoryRow,
  'id' | 'name' | 'color' | 'sort_order' | 'is_archived'
>;

export interface CategoryBreakdownItem {
  category_id: string;
  name: string;
  color: string;
  total_sec: number;
}

export interface StudyDashboardResponse {
  active_session: StudySessionDto | null;
  long_session_warning: boolean;
  today: {
    logical_date: string;
    day_type: DayType;
    completed_sec: number;
    goal_min: number;
    categories: CategoryBreakdownItem[];
  };
  week: {
    completed_sec: number;
    categories: CategoryBreakdownItem[];
  };
  streak_days: number;
  settings: {
    day_boundary_hour: number;
    streak_min_minutes: number;
    daily_goal_weekday_min: number;
    daily_goal_weekend_min: number;
    long_session_warn_min: number;
    univ_periods: UnivPeriod[];
  };
  categories: StudyCategorySummary[];
  locations: string[];
  recent_sessions: StudySessionDto[];
}

export interface DashboardQueryOptions {
  category_id?: string | null;
  location?: string | null;
  date?: string | null;
  limit?: number;
}

function buildCategoryBreakdown(
  sessions: StudySessionRow[],
  catMap: Map<string, StudyCategorySummary>
): CategoryBreakdownItem[] {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    if (s.duration_sec === null || s.duration_sec <= 0) continue;
    totals.set(s.category_id, (totals.get(s.category_id) ?? 0) + s.duration_sec);
  }

  return Array.from(totals.entries())
    .map(([category_id, total_sec]) => {
      const cat = catMap.get(category_id);
      return {
        category_id,
        name: cat?.name ?? 'Unknown',
        color: cat?.color ?? '#6B7280',
        total_sec,
      };
    })
    .sort((a, b) => b.total_sec - a.total_sec);
}

export function buildDashboardSummary(params: {
  sessions: StudySessionRow[];
  historySessions?: StudySessionRow[];
  activeRow: StudySessionRow | null;
  categories: StudyCategorySummary[];
  settings: StudySettingsRow;
  now: Date;
  filters?: DashboardQueryOptions;
}): StudyDashboardResponse {
  const { sessions, historySessions, activeRow, categories, settings, now, filters } = params;

  const catMap = new Map<string, StudyCategorySummary>();
  for (const c of categories) {
    catMap.set(c.id, c);
  }

  const mapDto = (row: StudySessionRow): StudySessionDto => {
    const cat = catMap.get(row.category_id) ?? { name: 'Unknown', color: '#6B7280' };
    return toStudySessionDto(row, cat);
  };

  const todayLogicalDate = getLogicalDateJst(now, settings.day_boundary_hour);
  const todayDayType = getDayType(now, settings.day_boundary_hour);
  const weekStartDate = addDaysToYmd(todayLogicalDate, -6);

  const dailyMinutesMap = new Map<string, number>();
  const todaySessions: StudySessionRow[] = [];
  const weekSessions: StudySessionRow[] = [];
  const locationSet = new Set<string>();

  for (const row of sessions) {
    if (row.location_label) {
      locationSet.add(row.location_label);
    }
    if (row.ended_at === null || row.duration_sec === null) {
      continue;
    }

    const logicalDate = getLogicalDateJst(new Date(row.started_at), settings.day_boundary_hour);
    dailyMinutesMap.set(
      logicalDate,
      (dailyMinutesMap.get(logicalDate) ?? 0) + row.duration_sec / 60
    );

    if (logicalDate === todayLogicalDate) {
      todaySessions.push(row);
    }
    if (logicalDate >= weekStartDate && logicalDate <= todayLogicalDate) {
      weekSessions.push(row);
    }
  }

  const todayCompletedSec = todaySessions.reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);
  const weekCompletedSec = weekSessions.reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);

  const activeDto = activeRow ? mapDto(activeRow) : null;
  const activeElapsedMin = activeRow
    ? (now.getTime() - new Date(activeRow.started_at).getTime()) / 60_000
    : 0;
  const longSessionWarning =
    activeRow !== null && activeElapsedMin >= settings.long_session_warn_min;

  const goalMin =
    todayDayType === 'weekday'
      ? settings.daily_goal_weekday_min
      : settings.daily_goal_weekend_min;

  const limit = filters?.limit ?? 50;
  const historySource = historySessions ?? sessions;
  const filteredHistory = historySource
    .filter((row) => {
      if (filters?.category_id && row.category_id !== filters.category_id) {
        return false;
      }
      if (filters?.location && row.location_label !== filters.location) {
        return false;
      }
      if (filters?.date) {
        const logicalDate = getLogicalDateJst(new Date(row.started_at), settings.day_boundary_hour);
        if (logicalDate !== filters.date) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, limit)
    .map(mapDto);

  return {
    active_session: activeDto,
    long_session_warning: longSessionWarning,
    today: {
      logical_date: todayLogicalDate,
      day_type: todayDayType,
      completed_sec: todayCompletedSec,
      goal_min: goalMin,
      categories: buildCategoryBreakdown(todaySessions, catMap),
    },
    week: {
      completed_sec: weekCompletedSec,
      categories: buildCategoryBreakdown(weekSessions, catMap),
    },
    streak_days: calculateStreak(dailyMinutesMap, todayLogicalDate, settings.streak_min_minutes),
    settings: {
      day_boundary_hour: settings.day_boundary_hour,
      streak_min_minutes: settings.streak_min_minutes,
      daily_goal_weekday_min: settings.daily_goal_weekday_min,
      daily_goal_weekend_min: settings.daily_goal_weekend_min,
      long_session_warn_min: settings.long_session_warn_min,
      univ_periods: settings.univ_periods,
    },
    categories,
    locations: Array.from(locationSet).sort((a, b) => a.localeCompare(b, 'ja')),
    recent_sessions: filteredHistory,
  };
}

export async function fetchUserSessionsInRange(
  supabase: SupabaseClient,
  userId: string,
  startIso: string,
  endIso?: string
): Promise<StudySessionRow[]> {
  const all: StudySessionRow[] = [];
  let lastId: string | null = null;

  while (true) {
    let query = supabase
      .from('study_sessions')
      .select('*')
      .eq('user_id', userId)
      .gte('started_at', startIso)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    if (endIso) {
      query = query.lt('started_at', endIso);
    }
    if (lastId !== null) {
      query = query.gt('id', lastId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error('Failed to load study sessions for dashboard.');
    }

    const batch = (data ?? []) as StudySessionRow[];
    if (batch.length === 0) {
      break;
    }

    all.push(...batch);
    lastId = batch[batch.length - 1].id;
    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return all;
}

export async function getStudyDashboardData(
  supabase: SupabaseClient,
  userId: string,
  filters?: DashboardQueryOptions,
  now: Date = new Date(),
  streakChunkDays: number = STREAK_CHUNK_DAYS
): Promise<StudyDashboardResponse> {
  const settings = await getStudySettings(supabase, userId);
  const todayLogicalDate = getLogicalDateJst(now, settings.day_boundary_hour);
  let windowStartDate = addDaysToYmd(todayLogicalDate, -(streakChunkDays - 1));
  const { startIso: initialSinceIso } = getLogicalDayBoundsUtc(
    windowStartDate,
    settings.day_boundary_hour
  );

  const needsDedicatedDateFetch = Boolean(filters?.date && filters.date < windowStartDate);
  const dateBounds =
    needsDedicatedDateFetch && filters?.date
      ? getLogicalDayBoundsUtc(filters.date, settings.day_boundary_hour)
      : null;

  const [initialSessions, activeRes, categoriesRes, dateSessions] = await Promise.all([
    fetchUserSessionsInRange(supabase, userId, initialSinceIso),
    supabase
      .from('study_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('ended_at', null)
      .maybeSingle(),
    supabase
      .from('study_categories')
      .select('id, name, color, sort_order, is_archived')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    dateBounds
      ? fetchUserSessionsInRange(supabase, userId, dateBounds.startIso, dateBounds.endIso)
      : Promise.resolve(undefined),
  ]);

  if (activeRes.error || categoriesRes.error) {
    throw new Error('Failed to load dashboard metadata.');
  }

  const allSessions = [...initialSessions];
  const categories = (categoriesRes.data ?? []) as StudyCategorySummary[];

  // If the streak reaches the start of the loaded window (accounting for today not yet met -> loadedDays - 1),
  // walk further back in chunks until the streak breaks or no older sessions exist.
  let summary = buildDashboardSummary({
    sessions: allSessions,
    historySessions: dateSessions,
    activeRow: (activeRes.data as StudySessionRow | null) ?? null,
    categories,
    settings,
    now,
    filters,
  });

  const todayMet = summary.today.completed_sec / 60 >= settings.streak_min_minutes;
  let loadedDays = streakChunkDays;
  let maxPossibleStreak = todayMet ? loadedDays : loadedDays - 1;

  while (maxPossibleStreak > 0 && summary.streak_days >= maxPossibleStreak) {
    const prevWindowEndIso = getLogicalDayBoundsUtc(
      windowStartDate,
      settings.day_boundary_hour
    ).startIso;
    windowStartDate = addDaysToYmd(windowStartDate, -streakChunkDays);
    const prevWindowStartIso = getLogicalDayBoundsUtc(
      windowStartDate,
      settings.day_boundary_hour
    ).startIso;

    const olderBatch = await fetchUserSessionsInRange(
      supabase,
      userId,
      prevWindowStartIso,
      prevWindowEndIso
    );
    if (olderBatch.length === 0) {
      break;
    }
    allSessions.push(...olderBatch);
    loadedDays += streakChunkDays;
    maxPossibleStreak = todayMet ? loadedDays : loadedDays - 1;

    summary = buildDashboardSummary({
      sessions: allSessions,
      historySessions: dateSessions,
      activeRow: (activeRes.data as StudySessionRow | null) ?? null,
      categories,
      settings,
      now,
      filters,
    });
  }

  return summary;
}
