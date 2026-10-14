// Ticket serial numbers (FR-08). Format NNNNNNN/MAE/A.M.DILI, continuing after the last paper
// ticket. The server hands each device a block in advance so the app can issue offline.

export const SERIAL_SUFFIX = '/MAE/A.M.DILI';
export const LAST_PAPER_SERIAL = 2538667;
export const SERIAL_DIGITS = 7;
export const DEFAULT_SERIAL_BLOCK_SIZE = 50;

const SERIAL_PATTERN = /^(\d{7,})\/MAE\/A\.M\.DILI$/;

export interface SerialBlock {
  /** First serial number in the block (inclusive). */
  start: number;
  /** Last serial number in the block (inclusive). */
  end: number;
}

function assertSerialNumber(n: number): void {
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new RangeError(`Serial number must be a positive integer, got ${n}`);
  }
}

export function formatSerial(n: number): string {
  assertSerialNumber(n);
  return String(n).padStart(SERIAL_DIGITS, '0') + SERIAL_SUFFIX;
}

/** The number in a formatted serial, or null if the text is not a valid serial. */
export function parseSerial(serial: string): number | null {
  const match = SERIAL_PATTERN.exec(serial.trim().toUpperCase());
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function isValidSerial(serial: string): boolean {
  return parseSerial(serial) !== null;
}

/**
 * The next block to allocate, given the end of the highest block ever allocated
 * (null if none yet). Server side only: allocation must happen in one transaction.
 */
export function nextSerialBlock(
  lastAllocatedEnd: number | null,
  size: number = DEFAULT_SERIAL_BLOCK_SIZE,
): SerialBlock {
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new RangeError(`Block size must be a positive integer, got ${size}`);
  }
  const start = Math.max(lastAllocatedEnd ?? LAST_PAPER_SERIAL, LAST_PAPER_SERIAL) + 1;
  return { start, end: start + size - 1 };
}

/** The next unused serial in the block, or null when the block is used up. */
export function nextSerialInBlock(block: SerialBlock, lastUsed: number | null): number | null {
  const next = lastUsed === null ? block.start : lastUsed + 1;
  if (next < block.start) {
    throw new RangeError(`Last used serial ${lastUsed} is outside the block`);
  }
  return next <= block.end ? next : null;
}

/** How many serials are still free in the block. */
export function remainingInBlock(block: SerialBlock, lastUsed: number | null): number {
  const next = nextSerialInBlock(block, lastUsed);
  return next === null ? 0 : block.end - next + 1;
}
