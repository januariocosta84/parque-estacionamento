import { describe, expect, it } from 'vitest';
import { diliDayRange, formatDiliDate, formatDiliTime, formatDuration } from './time';

describe('Asia/Dili display (UTC+9)', () => {
  it('formats a UTC instant as Dili date and time', () => {
    const at = new Date('2026-10-13T00:20:00Z');
    expect(formatDiliDate(at)).toBe('13/10/2026');
    expect(formatDiliTime(at)).toBe('09:20');
  });

  it('rolls over to the next Dili day at 15:00 UTC', () => {
    expect(formatDiliDate(new Date('2026-10-13T14:59:00Z'))).toBe('13/10/2026');
    expect(formatDiliDate(new Date('2026-10-13T15:00:00Z'))).toBe('14/10/2026');
    expect(formatDiliTime(new Date('2026-10-13T15:00:00Z'))).toBe('00:00');
  });

  it('rejects an invalid date', () => {
    expect(() => formatDiliDate(new Date('nope'))).toThrow(RangeError);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 h 0 min'],
    [105, '1 h 45 min'],
    [720, '12 h 0 min'],
  ])('%i → %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});

describe('diliDayRange', () => {
  it('returns the UTC bounds of the Dili day', () => {
    expect(diliDayRange(new Date('2026-10-13T00:20:00Z'))).toEqual({
      start: new Date('2026-10-12T15:00:00Z'),
      end: new Date('2026-10-13T15:00:00Z'),
    });
  });

  it('includes the start instant and excludes the end', () => {
    const { start, end } = diliDayRange(new Date('2026-10-12T15:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-12T15:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-13T15:00:00.000Z');
  });
});
