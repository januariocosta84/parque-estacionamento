import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARGING_RULE,
  calculateCharge,
  chargeTicket,
  hoursCharged,
  tariffInForce,
} from './charging';
import type { TariffPeriod } from './charging';

const MOTO = 'class-moto';
const CAR = 'class-car';
const entry = new Date('2026-10-13T00:20:00Z'); // 09:20 Dili

function after(minutes: number, seconds = 0): Date {
  return new Date(entry.getTime() + minutes * 60_000 + seconds * 1000);
}

describe('hoursCharged (BR-02 minimum 1 h, BR-03 each started hour is a full hour)', () => {
  it.each([
    ['0 min', 0, 1],
    ['1 min', 1, 1],
    ['59 min', 59, 1],
    ['60 min', 60, 1],
    ['61 min', 61, 2],
    ['1 h 45 min', 105, 2],
    ['2 h', 120, 2],
    ['12 h', 720, 12],
    ['12 h 1 min', 721, 13],
  ])('%s → %i h', (_label, minutes, expected) => {
    expect(hoursCharged(entry, after(minutes))).toBe(expected);
  });

  it('counts whole minutes only: 60 min 59 s is still 1 h', () => {
    expect(hoursCharged(entry, after(60, 59))).toBe(1);
  });

  it('rejects an exit before the entry', () => {
    expect(() => hoursCharged(entry, after(-1))).toThrow(RangeError);
  });

  it('honours a configurable grace period on the part hour (BR-03 to confirm)', () => {
    const rule = { ...DEFAULT_CHARGING_RULE, graceMinutes: 10 };
    expect(hoursCharged(entry, after(70), rule)).toBe(1);
    expect(hoursCharged(entry, after(71), rule)).toBe(2);
    // the minimum hour still applies
    expect(hoursCharged(entry, after(5), rule)).toBe(1);
  });
});

describe('calculateCharge (BR-01, money in integer cents)', () => {
  it('Motorizadas 50 c/h for 1 h 45 min → 2 h → 100 cents', () => {
    expect(calculateCharge({ entryAt: entry, exitAt: after(105), tariffCentsPerHour: 50 })).toEqual(
      { durationMinutes: 105, hoursCharged: 2, tariffCentsPerHour: 50, amountCents: 100 },
    );
  });

  it('0 min still charges the minimum hour', () => {
    expect(calculateCharge({ entryAt: entry, exitAt: entry, tariffCentsPerHour: 50 })).toEqual({
      durationMinutes: 0,
      hoursCharged: 1,
      tariffCentsPerHour: 50,
      amountCents: 50,
    });
  });

  it('12 h at 50 c/h → 600 cents', () => {
    expect(
      calculateCharge({ entryAt: entry, exitAt: after(720), tariffCentsPerHour: 50 }).amountCents,
    ).toBe(600);
  });

  it.each([0.5, -50, Number.NaN])('rejects a tariff that is not whole cents ≥ 0 (%s)', (cents) => {
    expect(() =>
      calculateCharge({ entryAt: entry, exitAt: after(60), tariffCentsPerHour: cents }),
    ).toThrow(RangeError);
  });

  it('always returns integers', () => {
    for (let m = 0; m <= 24 * 60; m += 7) {
      const c = calculateCharge({ entryAt: entry, exitAt: after(m), tariffCentsPerHour: 50 });
      expect(Number.isInteger(c.amountCents)).toBe(true);
      expect(Number.isInteger(c.hoursCharged)).toBe(true);
    }
  });
});

describe('tariffInForce', () => {
  const tariffs: TariffPeriod[] = [
    {
      vehicleClassId: MOTO,
      centsPerHour: 50,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validUntil: new Date('2026-10-13T01:00:00Z'),
    },
    {
      vehicleClassId: MOTO,
      centsPerHour: 75,
      validFrom: new Date('2026-10-13T01:00:00Z'),
      validUntil: null,
    },
  ];

  it('picks the period that contains the instant (validUntil is exclusive)', () => {
    expect(tariffInForce(tariffs, MOTO, new Date('2026-10-13T00:59:59Z'))?.centsPerHour).toBe(50);
    expect(tariffInForce(tariffs, MOTO, new Date('2026-10-13T01:00:00Z'))?.centsPerHour).toBe(75);
  });

  it('returns undefined when the class has no tariff (e.g. inactive placeholder)', () => {
    expect(tariffInForce(tariffs, CAR, entry)).toBeUndefined();
    expect(tariffInForce(tariffs, MOTO, new Date('2025-12-31T23:59:59Z'))).toBeUndefined();
  });

  it('BR-04: a tariff change between entry and exit does not affect the ticket', () => {
    // entry 00:20 at 50 c/h; tariff becomes 75 c/h at 01:00; exit 02:05 (1 h 45 min)
    const charge = chargeTicket(tariffs, MOTO, entry, after(105));
    expect(charge).toEqual({
      durationMinutes: 105,
      hoursCharged: 2,
      tariffCentsPerHour: 50,
      amountCents: 100,
    });
  });

  it('chargeTicket throws when no tariff was in force at entry', () => {
    expect(() => chargeTicket(tariffs, CAR, entry, after(60))).toThrow(/no tariff/i);
  });
});
