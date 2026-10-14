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
