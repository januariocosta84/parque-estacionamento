// Times are stored in UTC and shown in Asia/Dili (CLAUDE.md rule 3).
// Dili is UTC+9 all year (no daylight saving), so a fixed offset is exact and does not depend on
// the phone's Intl time-zone data.

export const DILI_UTC_OFFSET_MINUTES = 9 * 60;
const OFFSET_MS = DILI_UTC_OFFSET_MINUTES * 60_000;
const DAY_MS = 24 * 60 * 60_000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Shift so that the UTC getters return Dili wall-clock values. */
function diliClock(at: Date): Date {
  if (Number.isNaN(at.getTime())) throw new RangeError('Invalid date');
  return new Date(at.getTime() + OFFSET_MS);
}

/** "13/10/2026" */
export function formatDiliDate(at: Date): string {
  const d = diliClock(at);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** "09:20" */
export function formatDiliTime(at: Date): string {
  const d = diliClock(at);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** "1 h 45 min" */
export function formatDuration(minutes: number): string {
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    throw new RangeError(`Duration must be whole minutes ≥ 0, got ${minutes}`);
  }
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The UTC instants bounding the Dili calendar day that contains `at`: [start, end). */
export function diliDayRange(at: Date): { start: Date; end: Date } {
  const local = diliClock(at).getTime();
  const startLocal = local - (((local % DAY_MS) + DAY_MS) % DAY_MS);
  return {
    start: new Date(startLocal - OFFSET_MS),
    end: new Date(startLocal - OFFSET_MS + DAY_MS),
  };
}
