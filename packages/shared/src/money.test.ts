import { describe, expect, it } from 'vitest';
import { formatUsd, parseUsdInput } from './money';

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

describe('parseUsdInput (cash typed by the agent)', () => {
  it.each([
    ['2', 200],
    ['2,5', 250],
    ['2,50', 250],
    ['2.50', 250],
    [' $ 10,00 ', 1000],
    ['0,05', 5],
    ['1.234,56', 123456],
    ['1234', 123400],
  ])('%j → %i cents', (text, cents) => {
    expect(parseUsdInput(text)).toBe(cents);
  });

  it.each(['', 'abc', '2,505', '-1', '2,5,0', '1e3'])('rejects %j', (text) => {
    expect(parseUsdInput(text)).toBeNull();
  });

  it('round-trips with formatUsd', () => {
    for (const cents of [0, 5, 50, 200, 1800, 123456]) {
      expect(parseUsdInput(formatUsd(cents))).toBe(cents);
    }
  });
});
