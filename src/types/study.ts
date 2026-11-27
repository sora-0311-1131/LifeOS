export type SpotGroup = 'Home' | 'Univ' | 'Cafe' | 'Other';

export type DayType = 'weekday' | 'weekend' | 'holiday';

export interface UnivPeriod {
  key: string;
  label: string;
  /** JST HH:MM (24h) */
  start: string;
  /** JST HH:MM (24h) */
  end: string;
}

export const DEFAULT_UNIV_PERIODS: UnivPeriod[] = [
  { key: 'morning', label: '朝', start: '04:00', end: '08:50' },
  { key: 'period_1', label: '1限', start: '08:50', end: '10:20' },
  { key: 'period_2', label: '2限', start: '10:30', end: '12:00' },
  { key: 'lunch', label: '昼休み', start: '12:00', end: '13:00' },
  { key: 'period_3', label: '3限', start: '13:00', end: '14:30' },
  { key: 'period_4', label: '4限', start: '14:40', end: '16:10' },
  { key: 'period_5', label: '5限', start: '16:20', end: '17:50' },
  { key: 'after_school', label: '放課後', start: '17:50', end: '23:00' },
  { key: 'late_night', label: '深夜', start: '23:00', end: '04:00' },
];

export interface ApiTokenRow {
  id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** Client-safe API token representation (never includes token_hash). */
export type ApiTokenSummary = Omit<ApiTokenRow, 'token_hash' | 'user_id'>;

export interface StudySettingsRow {
  user_id: string;
  day_boundary_hour: number;
  streak_min_minutes: number;
  daily_goal_weekday_min: number;
  daily_goal_weekend_min: number;
  long_session_warn_min: number;
  univ_periods: UnivPeriod[];
  updated_at: string;
}

export interface StudyCategoryRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
  is_archived: boolean;
  created_at: string;
}

export interface StudySpotRow {
  id: string;
  user_id: string;
  name: string;
  spot_group: SpotGroup;
  latitude: number;
  longitude: number;
  radius_m: number;
  wifi_ssid: string | null;
  created_at: string;
}

export interface UnregisteredWifiSsidItem {
  ssid: string;
  session_count: number;
  last_seen_at: string;
  last_location_label: string;
}

export interface StudySessionRow {
  id: string;
  user_id: string;
  category_id: string;
  spot_id: string | null;
  goal_id: string | null;
  project_id: string | null;
  task_id: string | null;
  location_label: string;
  memo: string | null;
  tag_id: string | null;
  wifi_ssid: string | null;
  latitude: number | null;
  longitude: number | null;
  weather_code: number | null;
  temperature_c: number | null;
  pressure_hpa: number | null;
  pressure_diff_3h: number | null;
  pressure_diff_6h: number | null;
  day_type: DayType | null;
  univ_period: string | null;
  needs_review: boolean;
  start_event_id: string | null;
  stop_event_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  created_at: string;
}

/**
 * Unified authenticated session DTO for LifeOS (replaces YPT's split Public/Admin DTOs).
 * Sensitive fields (latitude, longitude, wifi_ssid, memo) are masked on the UI layer
 * when the LT mask toggle is active.
 */
export interface StudySessionDto {
  id: string;
  category_id: string;
  category_name: string;
  category_color: string;
  spot_id: string | null;
  goal_id: string | null;
  project_id: string | null;
  task_id: string | null;
  location_label: string;
  memo: string | null;
  tag_id: string | null;
  wifi_ssid: string | null;
  latitude: number | null;
  longitude: number | null;
  weather_code: number | null;
  temperature_c: number | null;
  pressure_hpa: number | null;
  pressure_diff_3h: number | null;
  pressure_diff_6h: number | null;
  day_type: DayType | null;
  univ_period: string | null;
  needs_review: boolean;
  start_event_id: string | null;
  stop_event_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  created_at: string;
}

export function toStudySessionDto(
  row: StudySessionRow,
  category: Pick<StudyCategoryRow, 'name' | 'color'>
): StudySessionDto {
  return {
    id: row.id,
    category_id: row.category_id,
    category_name: category.name,
    category_color: category.color,
    spot_id: row.spot_id,
    goal_id: row.goal_id,
    project_id: row.project_id,
    task_id: row.task_id,
    location_label: row.location_label,
    memo: row.memo,
    tag_id: row.tag_id,
    wifi_ssid: row.wifi_ssid,
    latitude: row.latitude,
    longitude: row.longitude,
    weather_code: row.weather_code,
    temperature_c: row.temperature_c,
    pressure_hpa: row.pressure_hpa,
    pressure_diff_3h: row.pressure_diff_3h,
    pressure_diff_6h: row.pressure_diff_6h,
    day_type: row.day_type,
    univ_period: row.univ_period,
    needs_review: row.needs_review,
    start_event_id: row.start_event_id,
    stop_event_id: row.stop_event_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    duration_sec: row.duration_sec,
    created_at: row.created_at,
  };
}
