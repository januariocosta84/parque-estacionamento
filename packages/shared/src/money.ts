// Money is integer US-dollar cents everywhere (CLAUDE.md rule 1). Formatting uses integer maths.

/** "$2,00" — dollar sign, comma decimals, dot thousands, as in the screen designs. */
export function formatUsd(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Amount must be a whole number of cents, got ${cents}`);
  }
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars},${rest}`;
}

/**
 * Cash typed by the agent → cents, or null if it is not a valid amount. Accepts "2", "2,5",
 * "2,50", "2.50", "$1.234,56". A "," or "." followed by 1–2 digits is the decimal mark; only "."
 * separates thousands (Portuguese style), so "2,505" is rejected rather than read as 2505.
 * String arithmetic only, never floats (CLAUDE.md rule 1).
 */
export function parseUsdInput(text: string): number | null {
  const s = text.replace(/[\s$]/g, '');
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!match) return null;
  const dollars = Number(match[1]!.replace(/[.,]/g, ''));
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const total = dollars * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}
