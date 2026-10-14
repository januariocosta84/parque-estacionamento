import { describe, expect, it } from 'vitest';
import { formatUsd } from './money';

describe('formatUsd', () => {
  it.each([
    [0, '$0,00'],
    [5, '$0,05'],
    [50, '$0,50'],
    [200, '$2,00'],
    [1800, '$18,00'],
    [123456789, '$1.234.567,89'],
    [-250, '-$2,50'],
  ])('%i cents → %s', (cents, text) => {
    expect(formatUsd(cents)).toBe(text);
  });

  it('rejects fractional cents', () => {
    expect(() => formatUsd(0.5)).toThrow(RangeError);
  });
});
