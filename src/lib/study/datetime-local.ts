const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Converts a UTC ISO timestamp into a `YYYY-MM-DDTHH:MM` string in JST (UTC+9)
 * for `<input type="datetime-local">` controls, independent of browser timezone.
 */
export function isoToJstDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const mo = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  const h = String(jst.getUTCHours()).padStart(2, '0');
  const mi = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

/**
 * Parses a JST `YYYY-MM-DDTHH:MM` string into a UTC ISO 8601 string.
 */
export function jstDatetimeLocalToIso(localStr: string): string | null {
  const trimmed = localStr.trim();
  const match = LOCAL_DATETIME_RE.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] ? Number(match[6]) : 0;

  // Validate real calendar date & time in UTC before subtracting JST offset
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return null;
  }

  return new Date(check.getTime() - JST_OFFSET_MS).toISOString();
}
