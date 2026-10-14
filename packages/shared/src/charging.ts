// The only place parking charges are calculated (CLAUDE.md rule 2).
// Used by the agent app, the API and the console. Money is integer US-dollar cents.

export interface ChargingRule {
  /** BR-02: minimum hours charged for any stay. */
  minimumHours: number;
  /**
   * BR-03 part-hour rule (to confirm with AMD). Minutes past the last full hour that are
   * not charged. 0 = each started hour counts as a full hour (1 h 45 min → 2 h).
   */
  graceMinutes: number;
}

export const DEFAULT_CHARGING_RULE: ChargingRule = { minimumHours: 1, graceMinutes: 0 };

export interface Charge {
  durationMinutes: number;
  hoursCharged: number;
  tariffCentsPerHour: number;
  amountCents: number;
}

/** A tariff period for one vehicle class. `validUntil` is exclusive; null = still in force. */
export interface TariffPeriod {
  vehicleClassId: string;
  centsPerHour: number;
  validFrom: Date;
  validUntil: Date | null;
}

const MS_PER_MINUTE = 60_000;

/** Whole minutes parked; seconds are dropped. Throws if exit is before entry. */
export function durationMinutes(entryAt: Date, exitAt: Date): number {
  const ms = exitAt.getTime() - entryAt.getTime();
  if (Number.isNaN(ms)) throw new RangeError('Invalid entry or exit time');
  if (ms < 0) throw new RangeError('Exit time is before entry time');
  return Math.floor(ms / MS_PER_MINUTE);
}

export function hoursCharged(
  entryAt: Date,
  exitAt: Date,
  rule: ChargingRule = DEFAULT_CHARGING_RULE,
): number {
  const minutes = durationMinutes(entryAt, exitAt);
  const fullHours = Math.floor(minutes / 60);
  const partMinutes = minutes % 60;
  const hours = partMinutes > rule.graceMinutes ? fullHours + 1 : fullHours;
  return Math.max(rule.minimumHours, hours);
}

function assertCents(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of cents ≥ 0, got ${value}`);
  }
}

/** BR-01–03. `tariffCentsPerHour` must be the tariff in force when the ticket was issued (BR-04). */
export function calculateCharge(
  input: { entryAt: Date; exitAt: Date; tariffCentsPerHour: number },
  rule: ChargingRule = DEFAULT_CHARGING_RULE,
): Charge {
  assertCents(input.tariffCentsPerHour, 'tariffCentsPerHour');
  const hours = hoursCharged(input.entryAt, input.exitAt, rule);
  return {
    durationMinutes: durationMinutes(input.entryAt, input.exitAt),
    hoursCharged: hours,
    tariffCentsPerHour: input.tariffCentsPerHour,
    amountCents: hours * input.tariffCentsPerHour,
  };
}

/** The tariff for a vehicle class in force at `at`, or undefined if there is none. */
export function tariffInForce(
  tariffs: readonly TariffPeriod[],
  vehicleClassId: string,
  at: Date,
): TariffPeriod | undefined {
  const t = at.getTime();
  return tariffs
    .filter(
      (p) =>
        p.vehicleClassId === vehicleClassId &&
        p.validFrom.getTime() <= t &&
        (p.validUntil === null || t < p.validUntil.getTime()),
    )
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];
}

/** BR-04: charge a stay at the tariff in force at entry, whatever changed before exit. */
export function chargeTicket(
  tariffs: readonly TariffPeriod[],
  vehicleClassId: string,
  entryAt: Date,
  exitAt: Date,
  rule: ChargingRule = DEFAULT_CHARGING_RULE,
): Charge {
  const tariff = tariffInForce(tariffs, vehicleClassId, entryAt);
  if (!tariff) {
    throw new Error(
      `No tariff in force for vehicle class ${vehicleClassId} at ${entryAt.toISOString()}`,
    );
  }
  return calculateCharge({ entryAt, exitAt, tariffCentsPerHour: tariff.centsPerHour }, rule);
}
