import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudySessionRow, StudySettingsRow } from '@/types/study';
import { fetchUserSessionsInRange } from './dashboard-service';
import { getStudySettings } from './study-service';
import {
  addDaysToYmd,
  getDayTypeForLogicalDate,
  getJstParts,
  getLogicalDateJst,
  getLogicalDayBoundsUtc,
  getOverlapSeconds,
} from './time';
import { getWeatherCategory, type WeatherCategory } from './weather';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CALENDAR_DAYS = 365;
const MAX_HEATMAP_SPAN_MS = 48 * 60 * 60 * 1000;

export type PressureBand = 'low' | 'normal' | 'high' | 'unknown';
export type PressureTrend = 'rapid_drop' | 'dropping' | 'stable' | 'rising' | 'unknown';

export interface CalendarDayItem {
  date: string;
  total_sec: number;
  session_count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface WeekdayHourCell {
  /** 0 (Sun) .. 6 (Sat) in JST */
  weekday: number;
  /** 0 .. 23 in JST */
  hour: number;
  total_sec: number;
}

export interface PeriodBreakdownItem {
  key: string;
  label: string;
  total_sec: number;
  session_count: number;
}

export interface GroupStatsItem<T extends string = string> {
  key: T;
  label: string;
  total_sec: number;
  session_count: number;
  avg_sec: number;
}

export interface StudyAnalyticsResponse {
  days: number;
  today_logical_date: string;
  total_sec: number;
  total_sessions: number;
  calendar: CalendarDayItem[];
  weekday_hour_heatmap: WeekdayHourCell[];
  univ_periods: PeriodBreakdownItem[];
  spots: GroupStatsItem[];
  weather: Array<GroupStatsItem<WeatherCategory>>;
  pressure: Array<GroupStatsItem<PressureBand>>;
  pressure_trend: Array<GroupStatsItem<PressureTrend>>;
}

export function getPressureBand(pressureHpa: number | null | undefined): PressureBand {
  if (typeof pressureHpa !== 'number' || !Number.isFinite(pressureHpa)) {
    return 'unknown';
  }
  if (pressureHpa < 1005) return 'low';
  if (pressureHpa <= 1015) return 'normal';
  return 'high';
}

/**
 * Classifies barometric pressure change using 6h delta (falling back to 3h delta).
 */
export function getPressureTrend(
  pressureDiff6h: number | null | undefined,
  pressureDiff3h?: number | null | undefined
): PressureTrend {
  const diff =
    typeof pressureDiff6h === 'number' && Number.isFinite(pressureDiff6h)
      ? pressureDiff6h
      : typeof pressureDiff3h === 'number' && Number.isFinite(pressureDiff3h)
        ? pressureDiff3h
        : null;
  if (diff === null) return 'unknown';
  if (diff <= -3) return 'rapid_drop';
  if (diff <= -1) return 'dropping';
  if (diff < 1) return 'stable';
  return 'rising';
}

function getCalendarLevel(totalSec: number, goalSec: number): 0 | 1 | 2 | 3 | 4 {
  if (totalSec <= 0) return 0;
  const ratio = totalSec / Math.max(60, goalSec);
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.9) return 3;
  return 4;
}

const WEATHER_LABELS: Record<WeatherCategory, string> = {
  sunny: '晴れ',
  cloudy: '曇り',
  rainy: '雨',
  snowy: '雪',
  unknown: 'データなし',
};

const PRESSURE_LABELS: Record<PressureBand, string> = {
  low: '低気圧 (<1005 hPa)',
  normal: '通常 (1005–1015 hPa)',
  high: '高気圧 (>1015 hPa)',
  unknown: 'データなし',
};

const PRESSURE_TREND_LABELS: Record<PressureTrend, string> = {
  rapid_drop: '急降下 (≤ -3 hPa)',
  dropping: 'やや低下 (-3〜-1 hPa)',
  stable: '安定 (-1〜+1 hPa)',
  rising: '上昇 (≥ +1 hPa)',
  unknown: 'データなし',
};

export function buildAnalyticsSummary(params: {
  sessions: StudySessionRow[];
  settings: StudySettingsRow;
  days: number;
  now: Date;
}): StudyAnalyticsResponse {
  const { sessions, settings, days, now } = params;
  const todayLogicalDate = getLogicalDateJst(now, settings.day_boundary_hour);
  const calendarStartDate = addDaysToYmd(todayLogicalDate, -(CALENDAR_DAYS - 1));
  const periodStartDate = addDaysToYmd(todayLogicalDate, -(days - 1));

  // 1. Calendar (always last 365 logical days)
  const calendarAgg = new Map<string, { total_sec: number; session_count: number }>();
  for (let i = 0; i < CALENDAR_DAYS; i += 1) {
    calendarAgg.set(addDaysToYmd(calendarStartDate, i), { total_sec: 0, session_count: 0 });
  }

  // 2. Period-filtered aggregations
  const heatmapMatrix = Array.from({ length: 7 }, () => Array<number>(24).fill(0));

  const periodAgg = new Map<string, { label: string; total_sec: number; session_count: number }>();
  for (const p of settings.univ_periods) {
    periodAgg.set(p.key, { label: p.label, total_sec: 0, session_count: 0 });
  }

  const spotAgg = new Map<string, { total_sec: number; session_count: number }>();
  const weatherAgg = new Map<WeatherCategory, { total_sec: number; session_count: number }>([
    ['sunny', { total_sec: 0, session_count: 0 }],
    ['cloudy', { total_sec: 0, session_count: 0 }],
    ['rainy', { total_sec: 0, session_count: 0 }],
    ['snowy', { total_sec: 0, session_count: 0 }],
    ['unknown', { total_sec: 0, session_count: 0 }],
  ]);
  const pressureAgg = new Map<PressureBand, { total_sec: number; session_count: number }>([
    ['low', { total_sec: 0, session_count: 0 }],
    ['normal', { total_sec: 0, session_count: 0 }],
    ['high', { total_sec: 0, session_count: 0 }],
    ['unknown', { total_sec: 0, session_count: 0 }],
  ]);
  const pressureTrendAgg = new Map<PressureTrend, { total_sec: number; session_count: number }>([
    ['rapid_drop', { total_sec: 0, session_count: 0 }],
    ['dropping', { total_sec: 0, session_count: 0 }],
    ['stable', { total_sec: 0, session_count: 0 }],
    ['rising', { total_sec: 0, session_count: 0 }],
    ['unknown', { total_sec: 0, session_count: 0 }],
  ]);

  let totalSec = 0;
  let totalSessions = 0;

  for (const row of sessions) {
    if (row.ended_at === null || row.duration_sec === null || row.duration_sec <= 0) {
      continue;
    }

    const startDate = new Date(row.started_at);
    const logicalDate = getLogicalDateJst(startDate, settings.day_boundary_hour);

    const calBucket = calendarAgg.get(logicalDate);
    if (calBucket) {
      calBucket.total_sec += row.duration_sec;
      calBucket.session_count += 1;
    }

    if (logicalDate < periodStartDate || logicalDate > todayLogicalDate) {
      continue;
    }

    totalSec += row.duration_sec;
    totalSessions += 1;

    // Distribute session duration across JST weekday x hour slots
    const startMs = startDate.getTime();
    const rawEndMs = new Date(row.ended_at).getTime();
    const endMs = Math.min(rawEndMs, startMs + MAX_HEATMAP_SPAN_MS);
    if (endMs > startMs) {
      const firstHourBucketUtcMs =
        Math.floor((startMs + JST_OFFSET_MS) / 3_600_000) * 3_600_000 - JST_OFFSET_MS;
      for (let slotStart = firstHourBucketUtcMs; slotStart < endMs; slotStart += 3_600_000) {
        const slotEnd = slotStart + 3_600_000;
        const overlap = getOverlapSeconds(startMs, endMs, slotStart, slotEnd);
        if (overlap > 0) {
          const { dayOfWeek, hour } = getJstParts(new Date(slotStart));
          heatmapMatrix[dayOfWeek][hour] += overlap;
        }
      }
    }

    // University period breakdown
    const pKey = row.univ_period ?? 'unclassified';
    const existingPeriod = periodAgg.get(pKey);
    if (existingPeriod) {
      existingPeriod.total_sec += row.duration_sec;
      existingPeriod.session_count += 1;
    } else {
      periodAgg.set(pKey, {
        label: pKey === 'unclassified' ? '時間割外' : pKey,
        total_sec: row.duration_sec,
        session_count: 1,
      });
    }

    // Spot breakdown
    const spotName = row.location_label || 'Other';
    const sBucket = spotAgg.get(spotName) ?? { total_sec: 0, session_count: 0 };
    sBucket.total_sec += row.duration_sec;
    sBucket.session_count += 1;
    spotAgg.set(spotName, sBucket);

    // Weather breakdown
    const wCat = getWeatherCategory(row.weather_code);
    const wBucket = weatherAgg.get(wCat)!;
    wBucket.total_sec += row.duration_sec;
    wBucket.session_count += 1;

    // Pressure breakdown
    const pBand = getPressureBand(row.pressure_hpa);
    const pBucket = pressureAgg.get(pBand)!;
    pBucket.total_sec += row.duration_sec;
    pBucket.session_count += 1;

    // Pressure trend (6h / 3h delta) breakdown
    const pTrend = getPressureTrend(row.pressure_diff_6h, row.pressure_diff_3h);
    const ptBucket = pressureTrendAgg.get(pTrend)!;
    ptBucket.total_sec += row.duration_sec;
    ptBucket.session_count += 1;
  }

  const weekdayGoalSec = settings.daily_goal_weekday_min * 60;
  const weekendGoalSec = settings.daily_goal_weekend_min * 60;

  const calendar: CalendarDayItem[] = Array.from(calendarAgg.entries()).map(([date, agg]) => {
    const goalSec =
      getDayTypeForLogicalDate(date) === 'weekday' ? weekdayGoalSec : weekendGoalSec;
    return {
      date,
      total_sec: agg.total_sec,
      session_count: agg.session_count,
      level: getCalendarLevel(agg.total_sec, goalSec),
    };
  });

  const weekday_hour_heatmap: WeekdayHourCell[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      weekday_hour_heatmap.push({
        weekday,
        hour,
        total_sec: heatmapMatrix[weekday][hour],
      });
    }
  }

  const univ_periods: PeriodBreakdownItem[] = Array.from(periodAgg.entries()).map(
    ([key, val]) => ({
      key,
      label: val.label,
      total_sec: val.total_sec,
      session_count: val.session_count,
    })
  );

  const spots: GroupStatsItem[] = Array.from(spotAgg.entries())
    .map(([key, val]) => ({
      key,
      label: key,
      total_sec: val.total_sec,
      session_count: val.session_count,
      avg_sec: val.session_count > 0 ? Math.round(val.total_sec / val.session_count) : 0,
    }))
    .sort((a, b) => b.total_sec - a.total_sec);

  const weather: Array<GroupStatsItem<WeatherCategory>> = (
    ['sunny', 'cloudy', 'rainy', 'snowy', 'unknown'] as const
  ).map((key) => {
    const val = weatherAgg.get(key)!;
    return {
      key,
      label: WEATHER_LABELS[key],
      total_sec: val.total_sec,
      session_count: val.session_count,
      avg_sec: val.session_count > 0 ? Math.round(val.total_sec / val.session_count) : 0,
    };
  });

  const pressure: Array<GroupStatsItem<PressureBand>> = (
    ['low', 'normal', 'high', 'unknown'] as const
  ).map((key) => {
    const val = pressureAgg.get(key)!;
    return {
      key,
      label: PRESSURE_LABELS[key],
      total_sec: val.total_sec,
      session_count: val.session_count,
      avg_sec: val.session_count > 0 ? Math.round(val.total_sec / val.session_count) : 0,
    };
  });

  const pressure_trend: Array<GroupStatsItem<PressureTrend>> = (
    ['rapid_drop', 'dropping', 'stable', 'rising', 'unknown'] as const
  ).map((key) => {
    const val = pressureTrendAgg.get(key)!;
    return {
      key,
      label: PRESSURE_TREND_LABELS[key],
      total_sec: val.total_sec,
      session_count: val.session_count,
      avg_sec: val.session_count > 0 ? Math.round(val.total_sec / val.session_count) : 0,
    };
  });

  return {
    days,
    today_logical_date: todayLogicalDate,
    total_sec: totalSec,
    total_sessions: totalSessions,
    calendar,
    weekday_hour_heatmap,
    univ_periods,
    spots,
    weather,
    pressure,
    pressure_trend,
  };
}

export async function getStudyAnalyticsData(
  supabase: SupabaseClient,
  userId: string,
  days = 90,
  now: Date = new Date()
): Promise<StudyAnalyticsResponse> {
  const settings = await getStudySettings(supabase, userId);
  const todayLogicalDate = getLogicalDateJst(now, settings.day_boundary_hour);
  const lookbackDays = Math.max(CALENDAR_DAYS, days);
  const startDate = addDaysToYmd(todayLogicalDate, -(lookbackDays - 1));
  const { startIso } = getLogicalDayBoundsUtc(startDate, settings.day_boundary_hour);

  const sessions = await fetchUserSessionsInRange(supabase, userId, startIso);

  return buildAnalyticsSummary({
    sessions,
    settings,
    days,
    now,
  });
}
