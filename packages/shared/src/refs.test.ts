import { describe, expect, it } from 'vitest';
import { TICKET_EVENT_SLOT, receiptNumber, ticketEventRef } from './refs';

describe('ticket event references (docs/DECISIONS.md)', () => {
  it('issue, exit and payment have fixed slots 01, 02, 03', () => {
    expect(ticketEventRef(2538668, TICKET_EVENT_SLOT.ISSUE)).toBe('EVT-2538668-01');
    expect(ticketEventRef(2538668, TICKET_EVENT_SLOT.EXIT)).toBe('EVT-2538668-02');
    expect(ticketEventRef(2538668, TICKET_EVENT_SLOT.PAYMENT)).toBe('EVT-2538668-03');
  });

  it('later events count on from 04 and pad to two digits', () => {
    expect(ticketEventRef(2538668, 4)).toBe('EVT-2538668-04');
    expect(ticketEventRef(2538668, 123)).toBe('EVT-2538668-123');
  });

  it('pads small serial numbers to 7 digits like the serial itself', () => {
    expect(ticketEventRef(42, 1)).toBe('EVT-0000042-01');
  });

  it.each([0, -1, 1.5])('rejects slot %s', (slot) => {
    expect(() => ticketEventRef(2538668, slot)).toThrow(RangeError);
  });
});

describe('receiptNumber', () => {
  it('is REC- plus the serial number', () => {
    expect(receiptNumber(2538668)).toBe('REC-2538668');
  });

  it('rejects a bad serial number', () => {
    expect(() => receiptNumber(0)).toThrow(RangeError);
  });
});
