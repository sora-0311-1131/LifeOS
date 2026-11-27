import { describe, expect, it } from 'vitest';
import { DEFAULT_UNIV_PERIODS } from '@/types/study';
import {
  isValidHexColor,
  isValidSpotGroup,
  parseJsonObject,
  parseUnivPeriodsOrDefault,
  validateUnivPeriods,
} from '../admin-validation';

describe('admin-validation utilities', () => {
  it('parses valid JSON object requests and rejects non-objects or malformed JSON', async () => {
    const validReq = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'Math' }),
    });
    expect(await parseJsonObject(validReq)).toEqual({ ok: true, data: { name: 'Math' } });

    const arrayReq = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify([1, 2, 3]),
    });
    expect((await parseJsonObject(arrayReq)).ok).toBe(false);

    const invalidReq = new Request('http://localhost/test', {
      method: 'POST',
      body: '{invalid',
    });
    expect((await parseJsonObject(invalidReq)).ok).toBe(false);
  });

  it('validates hex colors and spot groups', () => {
    expect(isValidHexColor('#3B82F6')).toBe(true);
    expect(isValidHexColor('#ffffff')).toBe(true);
    expect(isValidHexColor('#fff')).toBe(false);
    expect(isValidHexColor('3B82F6')).toBe(false);
    expect(isValidHexColor(123)).toBe(false);

    expect(isValidSpotGroup('Home')).toBe(true);
    expect(isValidSpotGroup('Univ')).toBe(true);
    expect(isValidSpotGroup('Cafe')).toBe(true);
    expect(isValidSpotGroup('Other')).toBe(true);
    expect(isValidSpotGroup('Library')).toBe(false);
  });

  it('validates univ_periods arrays and falls back to defaults on invalid input', () => {
    const valid = validateUnivPeriods([
      { key: 'period_1', label: '1限', start: '08:50', end: '10:20' },
      { key: 'late_night', label: '深夜', start: '23:00', end: '04:00' },
    ]);
    expect(valid.ok).toBe(true);

    expect(validateUnivPeriods([]).ok).toBe(false);
    expect(
      validateUnivPeriods([
        { key: 'dup', label: 'A', start: '08:00', end: '09:00' },
        { key: 'dup', label: 'B', start: '09:00', end: '10:00' },
      ]).ok
    ).toBe(false);
    expect(
      validateUnivPeriods([{ key: 'bad', label: 'Bad', start: '25:00', end: '26:00' }]).ok
    ).toBe(false);
    expect(
      validateUnivPeriods([{ key: 'same', label: 'Same', start: '10:00', end: '10:00' }]).ok
    ).toBe(false);

    expect(parseUnivPeriodsOrDefault('corrupted')).toEqual(DEFAULT_UNIV_PERIODS);
    expect(parseUnivPeriodsOrDefault(DEFAULT_UNIV_PERIODS)).toEqual(DEFAULT_UNIV_PERIODS);
  });
});
