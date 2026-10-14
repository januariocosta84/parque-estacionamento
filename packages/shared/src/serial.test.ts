import { describe, expect, it } from 'vitest';
import {
  formatSerial,
  isValidSerial,
  nextSerialBlock,
  nextSerialInBlock,
  parseSerial,
  remainingInBlock,
} from './serial';

describe('formatSerial / parseSerial', () => {
  it('formats the first digital serial after the last paper ticket', () => {
    expect(formatSerial(2538668)).toBe('2538668/MAE/A.M.DILI');
  });

  it('pads to 7 digits and does not truncate longer numbers', () => {
    expect(formatSerial(42)).toBe('0000042/MAE/A.M.DILI');
    expect(formatSerial(12345678)).toBe('12345678/MAE/A.M.DILI');
  });

  it.each([0, -1, 1.5])('rejects %s', (n) => {
    expect(() => formatSerial(n)).toThrow(RangeError);
  });

  it('round-trips', () => {
    for (const n of [1, 2538668, 9999999, 10000000]) {
      expect(parseSerial(formatSerial(n))).toBe(n);
    }
  });

  it('accepts lower case and surrounding spaces', () => {
    expect(parseSerial(' 2538668/mae/a.m.dili ')).toBe(2538668);
  });

  it.each(['', '2538668', '253866/MAE/A.M.DILI', '2538668/MAE/AMDILI', 'DL-26-00148'])(
    'rejects %j',
    (s) => {
      expect(parseSerial(s)).toBeNull();
      expect(isValidSerial(s)).toBe(false);
    },
  );
});

describe('serial blocks (FR-08)', () => {
  it('first block starts after 2538667', () => {
    expect(nextSerialBlock(null)).toEqual({ start: 2538668, end: 2538717 });
  });

  it('next block follows the last allocated one without gaps or overlap', () => {
    const a = nextSerialBlock(null, 50);
    const b = nextSerialBlock(a.end, 50);
    expect(b.start).toBe(a.end + 1);
    expect(b.end - b.start + 1).toBe(50);
  });

  it('never allocates at or below the last paper serial', () => {
    expect(nextSerialBlock(100, 10).start).toBe(2538668);
  });

  it('rejects a bad block size', () => {
    expect(() => nextSerialBlock(null, 0)).toThrow(RangeError);
  });

  it('hands out each serial in the block once, then reports it used up', () => {
    const block = { start: 10, end: 12 };
    expect(nextSerialInBlock(block, null)).toBe(10);
    expect(nextSerialInBlock(block, 10)).toBe(11);
    expect(nextSerialInBlock(block, 11)).toBe(12);
    expect(nextSerialInBlock(block, 12)).toBeNull();
    expect(remainingInBlock(block, null)).toBe(3);
    expect(remainingInBlock(block, 11)).toBe(1);
    expect(remainingInBlock(block, 12)).toBe(0);
  });

  it('rejects a last-used serial from before the block', () => {
    expect(() => nextSerialInBlock({ start: 10, end: 12 }, 5)).toThrow(RangeError);
  });
});
