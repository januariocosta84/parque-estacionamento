// Tickets on the phone. Every change is written to SQLite and the outbox in one transaction, so
// it works without signal (NFR-01) and reaches the server later exactly once.
import {
  TICKET_EVENT_SLOT,
  calculateCharge,
  diliDayRange,
  formatSerial,
  parseSerial,
  plateSchema,
  receiptNumber,
  tariffInForce,
  ticketEventRef,
} from '@estacionamento/shared';
import type { ChargeQuote, Receipt, Ticket } from '@estacionamento/shared';
import type { SqlDb } from '../db/types';
import type { Env } from '../env';
import type { Session } from '../session';
import { enqueue } from './outbox';
import { getSettings, getTariffs } from './reference';
import { takeNextSerial } from './serials';

export type LocalErrorCode =
  | 'NO_SERIALS'
  | 'NOT_SYNCED_YET'
  | 'VEHICLE_CLASS_INACTIVE'
  | 'NO_TARIFF'
  | 'AREA_REQUIRED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'ALREADY_PAID'
  | 'CHARGE_CHANGED'
  | 'INSUFFICIENT_PAYMENT';

export class LocalError extends Error {
  constructor(
    readonly code: LocalErrorCode,
    message: string,
    readonly quote?: ChargeQuote,
  ) {
    super(message);
  }
}

export interface LocalTicket extends Ticket {
  paymentId: string | null;
  receivedCents: number | null;
  changeCents: number | null;
  paidBy: string | null;
  syncState: 'local' | 'synced';
}

interface TicketRow {
  id: string;
  serial: string;
  plate: string;
  vehicle_class_id: string;
  area_id: string;
  agent_id: string;
  device_id: string;
  entry_at: string;
  exit_at: string | null;
  hours_charged: number | null;
  tariff_cents_per_hour: number;
  amount_cents: number | null;
  status: 'ATIVO' | 'PAGO';
  driver_phone: string | null;
  payment_id: string | null;
  received_cents: number | null;
  change_cents: number | null;
  paid_by: string | null;
  sync_state: 'local' | 'synced';
}

const toTicket = (r: TicketRow): LocalTicket => ({
  id: r.id,
  serial: r.serial,
  plate: r.plate,
  vehicleClassId: r.vehicle_class_id,
  areaId: r.area_id,
  agentId: r.agent_id,
  deviceId: r.device_id,
  entryAt: r.entry_at,
  exitAt: r.exit_at,
  hoursCharged: r.hours_charged,
  tariffCentsPerHour: r.tariff_cents_per_hour,
  amountCents: r.amount_cents,
  status: r.status,
  driverPhone: r.driver_phone,
  paymentId: r.payment_id,
  receivedCents: r.received_cents,
  changeCents: r.change_cents,
  paidBy: r.paid_by,
  syncState: r.sync_state,
});

export const issueRefOf = (serial: string) =>
  ticketEventRef(parseSerial(serial)!, TICKET_EVENT_SLOT.ISSUE);

export async function getTicket(db: SqlDb, id: string): Promise<LocalTicket | null> {
  const row = await db.first<TicketRow>('SELECT * FROM tickets WHERE id = ?', id);
  return row ? toTicket(row) : null;
}

// ── Issue (FR-06, FR-07, FR-08, FR-10) ──────────────────────────────────────

export async function issueTicket(
  env: Env,
  session: Session,
  input: { plate: string; vehicleClassId: string; areaId?: string; driverPhone?: string },
): Promise<LocalTicket> {
  const plate = plateSchema.parse(input.plate);
  const entryAt = env.now(); // system clock, never typed (BR-09)

  const areaId =
    input.areaId ?? (session.user.areaIds.length === 1 ? session.user.areaIds[0] : undefined);
  if (!areaId) throw new LocalError('AREA_REQUIRED', 'Choose an area');
  if (!session.user.areaIds.includes(areaId))
    throw new LocalError('FORBIDDEN', 'Not one of your areas');

  const vc = await env.db.first<{ active: number }>(
    'SELECT active FROM vehicle_classes WHERE id = ?',
    input.vehicleClassId,
  );
  if (!vc) throw new LocalError('NOT_SYNCED_YET', 'Vehicle classes not downloaded yet');
  if (vc.active !== 1) throw new LocalError('VEHICLE_CLASS_INACTIVE', 'Vehicle class not in use');
  const tariff = tariffInForce(
    await getTariffs(env.db, input.vehicleClassId),
    input.vehicleClassId,
    entryAt,
  );
  if (!tariff) throw new LocalError('NO_TARIFF', 'No tariff in force for this vehicle class');

  const id = env.newId();
  const issueEventId = env.newId();

  return env.db.transaction(async (tx) => {
    const serialNumber = await takeNextSerial(tx);
    if (serialNumber === null)
      throw new LocalError('NO_SERIALS', 'No serial numbers left; get signal to sync');
    const serial = formatSerial(serialNumber);

    await tx.run(
      `INSERT INTO tickets (id, serial, plate, vehicle_class_id, area_id, agent_id, device_id, entry_at,
         tariff_cents_per_hour, status, driver_phone, sync_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO', ?, 'local')`,
      id,
      serial,
      plate,
      input.vehicleClassId,
      areaId,
      session.user.id,
      session.deviceId,
      entryAt.toISOString(),
      tariff.centsPerHour,
      input.driverPhone ?? null,
    );
    await enqueue(tx, {
      id: issueEventId,
      userId: session.user.id,
      ticketId: id,
      createdAt: entryAt,
      item: {
        kind: 'TICKET_ISSUED',
        ticket: {
          id,
          serial,
          plate,
          vehicleClassId: input.vehicleClassId,
          areaId,
          entryAt: entryAt.toISOString(),
          tariffCentsPerHour: tariff.centsPerHour,
          driverPhone: input.driverPhone ?? null,
        },
        issueEventId,
      },
    });
    return toTicket((await tx.first<TicketRow>('SELECT * FROM tickets WHERE id = ?', id))!);
  });
}

// ── Quote and exit + payment (FR-14–17) ─────────────────────────────────────

async function chargingRule(db: SqlDb) {
  const settings = await getSettings(db);
  if (!settings) throw new LocalError('NOT_SYNCED_YET', 'Charging rule not downloaded yet');
  return settings.chargingRule;
}

function makeQuote(
  ticket: LocalTicket,
  exitAt: Date,
  rule: Awaited<ReturnType<typeof chargingRule>>,
): ChargeQuote {
  const c = calculateCharge(
    { entryAt: new Date(ticket.entryAt), exitAt, tariffCentsPerHour: ticket.tariffCentsPerHour },
    rule,
  );
  return {
    ticketId: ticket.id,
    entryAt: ticket.entryAt,
    exitAt: exitAt.toISOString(),
    durationMinutes: c.durationMinutes,
    hoursCharged: c.hoursCharged,
    tariffCentsPerHour: c.tariffCentsPerHour,
    amountCents: c.amountCents,
  };
}

async function openTicketFor(env: Env, session: Session, ticketId: string): Promise<LocalTicket> {
  const ticket = await getTicket(env.db, ticketId);
  if (!ticket) throw new LocalError('NOT_FOUND', 'Ticket not found');
  if (!session.user.areaIds.includes(ticket.areaId))
    throw new LocalError('FORBIDDEN', 'Not one of your areas');
  if (ticket.status === 'PAGO') throw new LocalError('ALREADY_PAID', 'Ticket is already paid');
  return ticket;
}

/** What the driver pays if they leave now. */
export async function quoteExit(
  env: Env,
  session: Session,
  ticketId: string,
): Promise<ChargeQuote> {
  const ticket = await openTicketFor(env, session, ticketId);
  return makeQuote(ticket, env.now(), await chargingRule(env.db));
}

/**
 * Exit and cash payment in one step (docs/DECISIONS.md). If a new hour started since the quote
 * shown to the driver, throws CHARGE_CHANGED with the new quote, like the server does.
 */
export async function closeTicket(
  env: Env,
  session: Session,
  ticketId: string,
  input: { expectedAmountCents: number; receivedCents: number },
): Promise<Receipt> {
  const ticket = await openTicketFor(env, session, ticketId);
  const quote = makeQuote(ticket, env.now(), await chargingRule(env.db));
  if (quote.amountCents !== input.expectedAmountCents) {
    throw new LocalError('CHARGE_CHANGED', 'The charge changed', quote);
  }
  if (input.receivedCents < quote.amountCents) {
    throw new LocalError('INSUFFICIENT_PAYMENT', 'Cash received is less than the amount due');
  }

  const paymentId = env.newId();
  const exitEventId = env.newId();
  const paymentEventId = env.newId();
  const changeCents = input.receivedCents - quote.amountCents;

  await env.db.transaction(async (tx) => {
    const { changes } = await tx.run(
      `UPDATE tickets SET exit_at = ?, hours_charged = ?, amount_cents = ?, status = 'PAGO',
         payment_id = ?, received_cents = ?, change_cents = ?, paid_by = ?, sync_state = 'local'
       WHERE id = ? AND status = 'ATIVO'`,
      quote.exitAt,
      quote.hoursCharged,
      quote.amountCents,
      paymentId,
      input.receivedCents,
      changeCents,
      session.user.id,
      ticket.id,
    );
    if (changes !== 1) throw new LocalError('ALREADY_PAID', 'Ticket is already paid');
    await enqueue(tx, {
      id: paymentEventId,
      userId: session.user.id,
      ticketId: ticket.id,
      createdAt: new Date(quote.exitAt),
      item: {
        kind: 'TICKET_CLOSED',
        ticketId: ticket.id,
        exitAt: quote.exitAt,
        hoursCharged: quote.hoursCharged,
        amountCents: quote.amountCents,
        payment: { id: paymentId, method: 'CASH', receivedCents: input.receivedCents },
        exitEventId,
        paymentEventId,
      },
    });
  });

  const serialNumber = parseSerial(ticket.serial)!;
  return {
    ticketId: ticket.id,
    receiptNo: receiptNumber(serialNumber),
    serial: ticket.serial,
    plate: ticket.plate,
    vehicleClassId: ticket.vehicleClassId,
    entryAt: ticket.entryAt,
    exitAt: quote.exitAt,
    hoursCharged: quote.hoursCharged,
    tariffCentsPerHour: quote.tariffCentsPerHour,
    amountCents: quote.amountCents,
    receivedCents: input.receivedCents,
    changeCents,
    method: 'CASH',
    agent: { id: session.user.id, name: session.user.name, agentNumber: session.user.agentNumber },
    paymentRef: ticketEventRef(serialNumber, TICKET_EVENT_SLOT.PAYMENT),
    paidAt: quote.exitAt,
  };
}

/** Receipt for a payment taken on this phone (FR-16), or null if it was not paid here. */
export async function getReceipt(
  db: SqlDb,
  session: Session,
  ticketId: string,
): Promise<Receipt | null> {
  const t = await getTicket(db, ticketId);
  if (!t || t.status !== 'PAGO' || !t.exitAt || t.paidBy !== session.user.id) return null;
  const serialNumber = parseSerial(t.serial)!;
  return {
    ticketId: t.id,
    receiptNo: receiptNumber(serialNumber),
    serial: t.serial,
    plate: t.plate,
    vehicleClassId: t.vehicleClassId,
    entryAt: t.entryAt,
    exitAt: t.exitAt,
    hoursCharged: t.hoursCharged!,
    tariffCentsPerHour: t.tariffCentsPerHour,
    amountCents: t.amountCents!,
    receivedCents: t.receivedCents ?? t.amountCents!,
    changeCents: t.changeCents ?? 0,
    method: 'CASH',
    agent: { id: session.user.id, name: session.user.name, agentNumber: session.user.agentNumber },
    paymentRef: ticketEventRef(serialNumber, TICKET_EVENT_SLOT.PAYMENT),
    paidAt: t.exitAt,
  };
}

/** Reference of the latest event on a ticket, as the history list shows it. */
export function lastEventRefOf(ticket: Pick<Ticket, 'serial' | 'status'>): string {
  const n = parseSerial(ticket.serial)!;
  return ticketEventRef(
    n,
    ticket.status === 'PAGO' ? TICKET_EVENT_SLOT.PAYMENT : TICKET_EVENT_SLOT.ISSUE,
  );
}

// ── Lists (FR-13, FR-18, FR-19) ─────────────────────────────────────────────

/** Vehicles parked in my areas, oldest first (home screen, FR-13). */
export async function parkedInMyAreas(db: SqlDb, session: Session): Promise<LocalTicket[]> {
  const areas = session.user.areaIds;
  if (areas.length === 0) return [];
  const rows = await db.all<TicketRow>(
    `SELECT * FROM tickets WHERE status = 'ATIVO' AND area_id IN (${areas.map(() => '?').join(',')})
     ORDER BY entry_at`,
    ...areas,
  );
  return rows.map(toTicket);
}

/** My tickets issued on the Dili day of `day`, newest first, with filter and search (FR-18). */
export async function myTicketsForDay(
  db: SqlDb,
  session: Session,
  day: Date,
  options: { status?: 'ATIVO' | 'PAGO'; q?: string } = {},
): Promise<LocalTicket[]> {
  const { start, end } = diliDayRange(day);
  const params: (string | number)[] = [session.user.id, start.toISOString(), end.toISOString()];
  let sql = 'SELECT * FROM tickets WHERE agent_id = ? AND entry_at >= ? AND entry_at < ?';
  if (options.status) {
    sql += ' AND status = ?';
    params.push(options.status);
  }
  if (options.q?.trim()) {
    sql += ' AND (plate LIKE ? OR serial LIKE ?)';
    const like = `%${options.q.trim().toUpperCase()}%`;
    params.push(like, like);
  }
  const rows = await db.all<TicketRow>(`${sql} ORDER BY entry_at DESC`, ...params);
  return rows.map(toTicket);
}

/** My parked count and cash taken today (FR-19). */
export async function todaySummary(db: SqlDb, session: Session, now: Date) {
  const { start, end } = diliDayRange(now);
  const parked = await db.first<{ n: number }>(
    "SELECT COUNT(*) AS n FROM tickets WHERE agent_id = ? AND status = 'ATIVO'",
    session.user.id,
  );
  const received = await db.first<{ total: number | null }>(
    'SELECT SUM(amount_cents) AS total FROM tickets WHERE paid_by = ? AND exit_at >= ? AND exit_at < ?',
    session.user.id,
    start.toISOString(),
    end.toISOString(),
  );
  return { parkedCount: parked?.n ?? 0, receivedTodayCents: received?.total ?? 0 };
}
