import { DEFAULT_UNIV_PERIODS, type SpotGroup, type UnivPeriod } from '@/types/study';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const HM_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const VALID_SPOT_GROUPS: ReadonlySet<SpotGroup> = new Set(['Home', 'Univ', 'Cafe', 'Other']);

export async function parseJsonObject(
  request: Request
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Request body must be a JSON object.' };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'Invalid JSON payload.' };
  }
}

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

export function isValidSpotGroup(value: unknown): value is SpotGroup {
  return typeof value === 'string' && VALID_SPOT_GROUPS.has(value as SpotGroup);
}

export function validateUnivPeriods(
  value: unknown
): { ok: true; periods: UnivPeriod[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) {
    return { ok: false, error: 'univ_periods must be a non-empty array (max 24 items).' };
  }

  const seenKeys = new Set<string>();
  const periods: UnivPeriod[] = [];

  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `univ_periods[${i}] must be an object.` };
    }
    const obj = item as Record<string, unknown>;
    const key = typeof obj.key === 'string' ? obj.key.trim() : '';
    const label = typeof obj.label === 'string' ? obj.label.trim() : '';
    const start = typeof obj.start === 'string' ? obj.start.trim() : '';
    const end = typeof obj.end === 'string' ? obj.end.trim() : '';

    if (!key || !label) {
      return { ok: false, error: `univ_periods[${i}] requires non-empty key and label.` };
    }
    if (seenKeys.has(key)) {
      return { ok: false, error: `Duplicate univ_periods key: ${key}` };
    }
    if (!HM_TIME_RE.test(start) || !HM_TIME_RE.test(end)) {
      return {
        ok: false,
        error: `univ_periods[${i}] start and end must use HH:MM (00:00-23:59) format.`,
      };
    }
    if (start === end) {
      return {
        ok: false,
        error: `univ_periods[${i}] start and end cannot be identical.`,
      };
    }

    seenKeys.add(key);
    periods.push({ key, label, start, end });
  }

  return { ok: true, periods };
}

/**
 * Safely parses `study_settings.univ_periods` loaded from jsonb, falling back
 * to `DEFAULT_UNIV_PERIODS` if malformed.
 */
export function parseUnivPeriodsOrDefault(value: unknown): UnivPeriod[] {
  const result = validateUnivPeriods(value);
  return result.ok ? result.periods : DEFAULT_UNIV_PERIODS;
}
