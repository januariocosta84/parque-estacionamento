// Human-readable references printed on tickets and receipts (docs/DECISIONS.md).
// Built from the ticket serial so a phone can create them offline without collisions.
import { SERIAL_DIGITS } from './serial';

/** Fixed per-ticket slots. Later events on the same ticket (print, SMS, correction) use 4, 5, … */
export const TICKET_EVENT_SLOT = { ISSUE: 1, EXIT: 2, PAYMENT: 3 } as const;
export const FIRST_FREE_TICKET_EVENT_SLOT = 4;

function serialDigits(serialNumber: number): string {
  if (!Number.isSafeInteger(serialNumber) || serialNumber <= 0) {
    throw new RangeError(`Serial number must be a positive integer, got ${serialNumber}`);
  }
  return String(serialNumber).padStart(SERIAL_DIGITS, '0');
}

/** "EVT-2538668-01" */
export function ticketEventRef(serialNumber: number, slot: number): string {
  if (!Number.isSafeInteger(slot) || slot < 1) {
    throw new RangeError(`Event slot must be a positive integer, got ${slot}`);
  }
  return `EVT-${serialDigits(serialNumber)}-${String(slot).padStart(2, '0')}`;
}

/** "REC-2538668" */
export function receiptNumber(serialNumber: number): string {
  return `REC-${serialDigits(serialNumber)}`;
}
