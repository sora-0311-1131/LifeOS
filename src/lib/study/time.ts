import type { DayType, UnivPeriod } from '@/types/study';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface JstParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
}

export function getJstParts(date: Date): JstParts {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    dayOfWeek: shifted.getUTCDay(),
  };
}

function formatYmd(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return formatYmd(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

/**
 * Returns the logical JST study date (`YYYY-MM-DD`) applying `dayBoundaryHour`.
 * Example: with `dayBoundaryHour = 4`, `2026-11-25 02:30 JST` belongs to `2026-11-24`.
 */
export function getLogicalDateJst(date: Date, dayBoundaryHour = 4): string {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS - dayBoundaryHour * 60 * 60 * 1000);
  return formatYmd(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/**
 * Returns the [startIso, endIso) UTC interval for a given logical JST date.
 */
export function getLogicalDayBoundsUtc(
  logicalDateYmd: string,
  dayBoundaryHour = 4
): { startIso: string; endIso: string } {
  const [y, m, d] = logicalDateYmd.split('-').map(Number);
  const startUtcMs = Date.UTC(y, m - 1, d, dayBoundaryHour, 0, 0) - JST_OFFSET_MS;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
  };
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (weekday - firstDow + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * Computes Japanese national holidays for a given year (2020+),
 * including Happy Mondays, equinoxes, 2020/2021 Olympic overrides,
 * substitute holidays, and Citizens' Holidays.
 */
export function getJapaneseHolidaysForYear(year: number): Set<string> {
  const marineDay =
    year === 2020
      ? formatYmd(2020, 7, 23)
      : year === 2021
        ? formatYmd(2021, 7, 22)
        : formatYmd(year, 7, nthWeekdayOfMonth(year, 7, 1, 3));
  const mountainDay =
    year === 2020
      ? formatYmd(2020, 8, 10)
      : year === 2021
        ? formatYmd(2021, 8, 8)
        : formatYmd(year, 8, 11);
  const sportsDay =
    year === 2020
      ? formatYmd(2020, 7, 24)
      : year === 2021
        ? formatYmd(2021, 7, 23)
        : formatYmd(year, 10, nthWeekdayOfMonth(year, 10, 1, 2));

  const base = new Set<string>([
    formatYmd(year, 1, 1), // New Year's Day
    formatYmd(year, 1, nthWeekdayOfMonth(year, 1, 1, 2)), // Coming of Age Day
    formatYmd(year, 2, 11), // National Foundation Day
    formatYmd(year, 2, 23), // Emperor's Birthday
    formatYmd(year, 3, vernalEquinoxDay(year)), // Vernal Equinox Day
    formatYmd(year, 4, 29), // Showa Day
    formatYmd(year, 5, 3), // Constitution Memorial Day
    formatYmd(year, 5, 4), // Greenery Day
    formatYmd(year, 5, 5), // Children's Day
    marineDay, // Marine Day
    mountainDay, // Mountain Day
    formatYmd(year, 9, nthWeekdayOfMonth(year, 9, 1, 3)), // Respect for the Aged Day
    formatYmd(year, 9, autumnalEquinoxDay(year)), // Autumnal Equinox Day
    sportsDay, // Sports Day
    formatYmd(year, 11, 3), // Culture Day
    formatYmd(year, 11, 23), // Labor Thanksgiving Day
  ]);

  const all = new Set<string>(base);

  // Substitute holidays (if a base holiday falls on Sunday, next non-holiday weekday becomes a holiday)
  for (const h of base) {
    const [y, m, d] = h.split('-').map(Number);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0) {
      let next = addDaysToYmd(h, 1);
      while (all.has(next)) {
        next = addDaysToYmd(next, 1);
      }
      all.add(next);
    }
  }

  // Citizens' Holiday (a non-holiday sandwiched directly between two base holidays, e.g., September)
  for (const h of base) {
    const middle = addDaysToYmd(h, 1);
    const after = addDaysToYmd(h, 2);
    if (!all.has(middle) && base.has(after)) {
      all.add(middle);
    }
  }

  return all;
}

const holidayCache = new Map<number, ReadonlySet<string>>();

/** Returns the (memoized) holiday set for a year so per-day loops don't recompute it. */
function getCachedHolidays(year: number): ReadonlySet<string> {
  let holidays = holidayCache.get(year);
  if (!holidays) {
    holidays = getJapaneseHolidaysForYear(year);
    holidayCache.set(year, holidays);
  }
  return holidays;
}

export function isJapaneseHoliday(ymd: string): boolean {
  const year = Number(ymd.slice(0, 4));
  if (!Number.isInteger(year)) {
    return false;
  }
  return getCachedHolidays(year).has(ymd);
}

/**
 * Classifies a logical JST date (`YYYY-MM-DD`) into `holiday` / `weekend` / `weekday`.
 */
export function getDayTypeForLogicalDate(logicalYmd: string): DayType {
  if (isJapaneseHoliday(logicalYmd)) {
    return 'holiday';
  }
  const [y, m, d] = logicalYmd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 0 || dow === 6) {
    return 'weekend';
  }
  return 'weekday';
}

/**
 * Classifies a timestamp into `holiday` / `weekend` / `weekday` using the logical JST date.
 */
export function getDayType(date: Date, dayBoundaryHour = 4): DayType {
  return getDayTypeForLogicalDate(getLogicalDateJst(date, dayBoundaryHour));
}

function parseHmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Resolves the university period key for a timestamp in JST.
 * Supports ranges that wrap past midnight (e.g. `23:00` - `04:00`).
 */
export function getUnivPeriod(date: Date, periods: UnivPeriod[]): string | null {
  const { hour, minute } = getJstParts(date);
  const currentMin = hour * 60 + minute;

  for (const period of periods) {
    const startMin = parseHmToMinutes(period.start);
    const endMin = parseHmToMinutes(period.end);

    if (startMin < endMin) {
      if (currentMin >= startMin && currentMin < endMin) {
        return period.key;
      }
    } else if (startMin > endMin) {
      // Wraps midnight (e.g., 23:00 to 04:00)
      if (currentMin >= startMin || currentMin < endMin) {
        return period.key;
      }
    }
  }

  return null;
}

/**
 * Computes overlapping seconds between [startMs, endMs] and [windowStartMs, windowEndMs].
 */
export function getOverlapSeconds(
  startMs: number,
  endMs: number,
  windowStartMs: number,
  windowEndMs: number
): number {
  const overlapStart = Math.max(startMs, windowStartMs);
  const overlapEnd = Math.min(endMs, windowEndMs);
  return Math.max(0, Math.floor((overlapEnd - overlapStart) / 1000));
}

/**
 * Calculates consecutive study streak days ending at `todayLogicalDate` (or yesterday if today is not yet met).
 */
export function calculateStreak(
  dailyMinutes: Map<string, number>,
  todayLogicalDate: string,
  streakMinMinutes: number
): number {
  const isMet = (ymd: string) => (dailyMinutes.get(ymd) ?? 0) >= streakMinMinutes;

  let cursor = todayLogicalDate;
  if (!isMet(cursor)) {
    cursor = addDaysToYmd(cursor, -1);
    if (!isMet(cursor)) {
      return 0;
    }
  }

  let streak = 0;
  while (isMet(cursor)) {
    streak += 1;
    cursor = addDaysToYmd(cursor, -1);
  }

  return streak;
}
