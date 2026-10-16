// Plate reading (FR-29): pick likely plates out of the text the phone camera recognised.
// The agent always checks the result before issuing, so this only ranks suggestions. No plate
// format is assumed (Timor-Leste formats vary); a plate here is a short run of letters and digits
// with at least one digit.

const MAX_CHARS = 9; // letters and digits, ignoring spaces and dashes
const MIN_CHARS = 3;
const MAX_SUGGESTIONS = 3;

/** Upper case, dashes unified, other punctuation dropped, spaces collapsed. */
export function cleanPlateText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[·•.:_–—]/g, '-')
    .replace(/[^A-Z0-9 -]/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^-+|-+$/g, '');
}

const alnum = (s: string) => s.replace(/[^A-Z0-9]/g, '');
const digits = (s: string) => s.replace(/[^0-9]/g, '').length;

function isPlateLike(s: string): boolean {
  const n = alnum(s).length;
  return n >= MIN_CHARS && n <= MAX_CHARS && digits(s) > 0;
}

function score(s: string): number {
  const d = digits(s);
  const letters = alnum(s).length - d;
  return d * 2 + letters + (d > 0 && letters > 0 ? 3 : 0) + (s.includes('-') ? 1 : 0);
}

/**
 * Likely plates, best first (at most three). `texts` is what the recogniser returned: blocks or
 * lines, possibly multi-line. Two short neighbouring lines are also tried together, for plates
 * written on two rows (common on motorbikes).
 */
export function plateCandidates(texts: readonly string[]): string[] {
  const lines = texts
    .flatMap((t) => t.split(/\r?\n/))
    .map(cleanPlateText)
    .filter((l) => l !== '');

  const found: string[] = lines.filter(isPlateLike);
  for (let i = 0; i + 1 < lines.length; i++) {
    const [a, b] = [lines[i]!, lines[i + 1]!];
    const joined = `${a} ${b}`;
    if (alnum(a).length <= 5 && alnum(b).length <= 5 && isPlateLike(joined)) found.push(joined);
  }

  return [...new Set(found)]
    .map((s, i) => ({ s, i, score: score(s) }))
    .sort((x, y) => y.score - x.score || x.i - y.i)
    .slice(0, MAX_SUGGESTIONS)
    .map((x) => x.s);
}
