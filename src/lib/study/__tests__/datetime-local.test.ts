import { describe, expect, it } from 'vitest';
import { isoToJstDatetimeLocal, jstDatetimeLocalToIso } from '../datetime-local';

describe('datetime-local JST helpers', () => {
  it('converts UTC ISO to JST datetime-local and back without timezone drift', () => {
    const iso = '2026-11-25T00:30:00.000Z';
    const local = isoToJstDatetimeLocal(iso);
    expect(local).toBe('2026-11-25T09:30');
    expect(jstDatetimeLocalToIso(local)).toBe(iso);
  });

  it('rejects invalid dates and malformed strings', () => {
    expect(jstDatetimeLocalToIso('2026-02-31T10:00')).toBeNull();
    expect(jstDatetimeLocalToIso('not-a-date')).toBeNull();
    expect(isoToJstDatetimeLocal(null)).toBe('');
  });
});
