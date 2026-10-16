import { describe, expect, it } from 'vitest';
import { cleanPlateText, plateCandidates } from './plate';

describe('cleanPlateText', () => {
  it.each([
    ['a-2847-tl', 'A-2847-TL'],
    [' A  2847  TL ', 'A 2847 TL'],
    ['A·2847·TL', 'A-2847-TL'],
    ['A – 2847 – TL', 'A-2847-TL'],
    ['"A-2847-TL".', 'A-2847-TL'],
    ['-12-345-', '12-345'],
  ])('%j → %j', (input, expected) => {
    expect(cleanPlateText(input)).toBe(expected);
  });
});

describe('plateCandidates (FR-29)', () => {
  it('skips words without digits such as the country name', () => {
    expect(plateCandidates(['TIMOR-LESTE', 'A-2847-TL'])[0]).toBe('A-2847-TL');
  });

  it('reads plates inside multi-line blocks', () => {
    expect(plateCandidates(['RDTL\n12-345'])).toContain('12-345');
  });

  it('joins two short rows, as on motorbike plates', () => {
    expect(plateCandidates(['AB', '1234'])[0]).toBe('AB 1234');
  });

  it('prefers letters with digits over digits only', () => {
    expect(plateCandidates(['12345', 'A-2847-TL'])[0]).toBe('A-2847-TL');
  });

  it('ignores long text, brand names and empty results', () => {
    expect(plateCandidates([])).toEqual([]);
    expect(plateCandidates(['HONDA', 'SUPRA X'])).toEqual([]);
    expect(plateCandidates(['DILI MUNICIPAL PARKING 2026'])).toEqual([]);
  });

  it('returns at most three suggestions, without duplicates', () => {
    const out = plateCandidates(['A-1111-TL', 'A-1111-TL', 'B-2222-TL', 'C-3333-TL', 'D-4444-TL']);
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
  });
});
