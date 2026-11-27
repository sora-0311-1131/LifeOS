import { describe, expect, it } from 'vitest';
import {
  formatDurationHm,
  formatDurationHms,
  formatJstDateHm,
  formatJstTimeHm,
  formatWeatherLabel,
} from '../format';

describe('format utilities', () => {
  it('formats seconds as HH:MM:SS and Hh MMm', () => {
    expect(formatDurationHms(0)).toBe('00:00:00');
    expect(formatDurationHms(3661)).toBe('01:01:01');
    expect(formatDurationHms(-10)).toBe('00:00:00');

    expect(formatDurationHm(0)).toBe('0m');
    expect(formatDurationHm(2700)).toBe('45m');
    expect(formatDurationHm(5400)).toBe('1h 30m');
  });

  it('formats JST HH:MM, YYYY/MM/DD HH:MM, and weather labels', () => {
    expect(formatJstTimeHm('2026-11-25T00:15:00.000Z')).toBe('09:15');
    expect(formatJstDateHm('2026-11-25T00:15:00.000Z')).toBe('2026/11/25 09:15');
    expect(formatWeatherLabel(0)).toBe('晴れ');
    expect(formatWeatherLabel(61)).toBe('雨');
    expect(formatWeatherLabel(null)).toBe('不明');
  });
});
