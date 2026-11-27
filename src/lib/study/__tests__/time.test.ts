import { describe, expect, it } from 'vitest';
import type { UnivPeriod } from '@/types/study';
import {
  calculateStreak,
  getDayType,
  getLogicalDateJst,
  getLogicalDayBoundsUtc,
  getOverlapSeconds,
  getUnivPeriod,
  isJapaneseHoliday,
} from '../time';

const defaultPeriods: UnivPeriod[] = [
  { key: 'morning', label: '朝', start: '04:00', end: '08:50' },
  { key: 'period_1', label: '1限', start: '08:50', end: '10:20' },
  { key: 'period_2', label: '2限', start: '10:30', end: '12:00' },
  { key: 'after_school', label: '放課後', start: '17:50', end: '23:00' },
  { key: 'late_night', label: '深夜', start: '23:00', end: '04:00' },
];

describe('time utilities', () => {
  it('applies dayBoundaryHour to compute logical JST date', () => {
    expect(getLogicalDateJst(new Date('2026-11-24T18:59:00.000Z'), 4)).toBe('2026-11-24');
    expect(getLogicalDateJst(new Date('2026-11-24T19:00:00.000Z'), 4)).toBe('2026-11-25');
    expect(getLogicalDateJst(new Date('2026-11-24T15:30:00.000Z'), 0)).toBe('2026-11-25');
  });

  it('computes UTC bounds for a logical JST date', () => {
    const bounds = getLogicalDayBoundsUtc('2026-11-25', 4);
    expect(bounds.startIso).toBe('2026-11-24T19:00:00.000Z');
    expect(bounds.endIso).toBe('2026-11-25T19:00:00.000Z');
  });

  it('detects Japanese national holidays including substitute, citizens, and 2020/2021 Olympic holidays', () => {
    expect(isJapaneseHoliday('2026-01-01')).toBe(true);
    expect(isJapaneseHoliday('2026-11-23')).toBe(true);
    expect(isJapaneseHoliday('2026-05-06')).toBe(true);
    expect(isJapaneseHoliday('2026-09-22')).toBe(true);
    expect(isJapaneseHoliday('2020-07-23')).toBe(true);
    expect(isJapaneseHoliday('2020-07-24')).toBe(true);
    expect(isJapaneseHoliday('2020-10-12')).toBe(false);
    expect(isJapaneseHoliday('2021-08-09')).toBe(true);
    expect(isJapaneseHoliday('2026-11-25')).toBe(false);
  });

  it('classifies weekday, weekend, and holiday correctly', () => {
    expect(getDayType(new Date('2026-11-25T01:00:00.000Z'), 4)).toBe('weekday');
    expect(getDayType(new Date('2026-11-28T01:00:00.000Z'), 4)).toBe('weekend');
    expect(getDayType(new Date('2026-11-23T01:00:00.000Z'), 4)).toBe('holiday');
  });

  it('resolves university periods including midnight wrap-around', () => {
    expect(getUnivPeriod(new Date('2026-11-25T00:15:00.000Z'), defaultPeriods)).toBe('period_1');
    expect(getUnivPeriod(new Date('2026-11-25T14:30:00.000Z'), defaultPeriods)).toBe('late_night');
    expect(getUnivPeriod(new Date('2026-11-24T16:45:00.000Z'), defaultPeriods)).toBe('late_night');
    expect(getUnivPeriod(new Date('2026-11-25T01:25:00.000Z'), defaultPeriods)).toBeNull();
  });

  it('computes overlap seconds accurately across day boundaries', () => {
    const bounds = getLogicalDayBoundsUtc('2026-11-25', 4);
    const windowStart = new Date(bounds.startIso).getTime();
    const windowEnd = new Date(bounds.endIso).getTime();

    const startMs = new Date('2026-11-24T18:30:00.000Z').getTime();
    const nowMs = new Date('2026-11-24T19:30:00.000Z').getTime();
    expect(getOverlapSeconds(startMs, nowMs, windowStart, windowEnd)).toBe(1800);

    expect(
      getOverlapSeconds(
        new Date('2026-11-24T10:00:00.000Z').getTime(),
        new Date('2026-11-24T11:00:00.000Z').getTime(),
        windowStart,
        windowEnd
      )
    ).toBe(0);
  });

  it('calculates study streak accurately', () => {
    const map = new Map<string, number>([
      ['2026-11-22', 45],
      ['2026-11-23', 30],
      ['2026-11-24', 60],
      ['2026-11-25', 10],
    ]);

    expect(calculateStreak(map, '2026-11-25', 30)).toBe(3);

    map.set('2026-11-25', 30);
    expect(calculateStreak(map, '2026-11-25', 30)).toBe(4);

    map.set('2026-11-24', 15);
    map.set('2026-11-25', 10);
    expect(calculateStreak(map, '2026-11-25', 30)).toBe(0);
  });
});
