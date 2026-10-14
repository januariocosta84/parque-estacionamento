// Applying items uploaded from a phone's outbox (docs/SYNC.md §3).
// Each item runs in its own transaction; one bad item never blocks the others.
import {
  FIRST_FREE_TICKET_EVENT_SLOT,
  TICKET_EVENT_SLOT,
  calculateCharge,
  parseSerial,
  receiptNumber,
  tariffInForce,
  ticketEventRef,
} from '@estacionamento/shared';
import type {
  PushItem,
  PushResult,
  SignInItem,
  TicketClosedItem,
  TicketIssuedItem,
} from '@estacionamento/shared';
import type { AuthContext } from '../auth/guard';
import type { Db } from '../db';
import { writeEvent } from '../events';
import { ApiError } from '../http';
import { getSetting } from '../settings';
import { canRecordExit } from '../tickets/access';
import { serialNumberOf } from '../tickets/mapping';

export interface PushContext {
  db: Db;
  auth: AuthContext & { deviceId: string };
  /** Present only when the phone clock is off by more than the configured limit. */
  clockSkewSeconds: number | undefined;
  log: { error: (obj: unknown, msg: string) => void };
}

const applied: PushResult = { status: 'applied' };
const duplicate: PushResult = { status: 'duplicate' };

function rejected(err: ApiError): PushResult {
  return { status: 'rejected', error: err.code, message: err.message };
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2002';
}

const skewDetails = (ctx: PushContext) =>
  ctx.clockSkewSeconds === undefined ? {} : { clockSkewSeconds: ctx.clockSkewSeconds };

// ── TICKET_ISSUED ───────────────────────────────────────────────────────────

async function applyIssued(ctx: PushContext, item: TicketIssuedItem): Promise<PushResult> {
  const { db, auth } = ctx;
  const t = item.ticket;
  const entryAt = new Date(t.entryAt);

  const existing = await db.ticket.findUnique({ where: { id: t.id } });
  if (existing) {
    const same =
      existing.serial === t.serial &&
      existing.plate === t.plate &&
      existing.vehicleClassId === t.vehicleClassId &&
      existing.areaId === t.areaId &&
      existing.agentId === auth.user.id &&
      existing.deviceId === auth.deviceId &&
      existing.entryAt.getTime() === entryAt.getTime() &&
      existing.tariffCentsPerHour === t.tariffCentsPerHour;
    if (same) return duplicate;
    throw new ApiError('CONFLICT', 'A different ticket with this id already exists');
  }

  const serialNumber = parseSerial(t.serial)!;
  const block = await db.serialBlock.findFirst({
    where: { deviceId: auth.deviceId, start: { lte: serialNumber }, end: { gte: serialNumber } },
  });
  if (!block) {
    throw new ApiError('SERIAL_NOT_ALLOCATED', 'Serial is not in a block allocated to this phone');
  }
  if (!auth.user.areaIds.includes(t.areaId)) {
    throw new ApiError('FORBIDDEN', 'Not one of your areas');
  }
  const vehicleClass = await db.vehicleClass.findUnique({ where: { id: t.vehicleClassId } });
  if (!vehicleClass) throw new ApiError('BAD_REQUEST', 'Unknown vehicle class');

  // The phone's tariff is what the driver was told; keep it, but flag if the server disagrees.
  const tariffs = await db.tariff.findMany({ where: { vehicleClassId: vehicleClass.id } });
  const expected = tariffInForce(tariffs, vehicleClass.id, entryAt)?.centsPerHour ?? null;
  const tariffFlag =
    expected === t.tariffCentsPerHour ? {} : { tariffMismatch: { expectedCentsPerHour: expected } };

  await db.$transaction(async (tx) => {
    const created = await tx.ticket.create({
      data: {
        id: t.id,
        serial: t.serial,
        plate: t.plate,
        vehicleClassId: vehicleClass.id,
        areaId: t.areaId,
        agentId: auth.user.id,
        deviceId: auth.deviceId,
        entryAt,
        tariffCentsPerHour: t.tariffCentsPerHour,
        driverPhone: t.driverPhone ?? null,
      },
    });
    await writeEvent(tx, {
      id: item.issueEventId,
      type: 'ISSUE',
      ref: ticketEventRef(serialNumber, TICKET_EVENT_SLOT.ISSUE),
      at: entryAt,
      userId: auth.user.id,
      deviceId: auth.deviceId,
      ticketId: created.id,
      details: {
        serial: created.serial,
        plate: created.plate,
        vehicleClassId: created.vehicleClassId,
        areaId: created.areaId,
        tariffCentsPerHour: created.tariffCentsPerHour,
        copies: ['WHITE', 'YELLOW', 'RED'],
        offline: true,
        ...tariffFlag,
        ...skewDetails(ctx),
      },
    });
  });
  return applied;
}

// ── TICKET_CLOSED ───────────────────────────────────────────────────────────

async function recordDoubleClose(ctx: PushContext, item: TicketClosedItem, serial: string) {
  const { db, auth } = ctx;
  const count = await db.event.count({ where: { ticketId: item.ticketId } });
  const slot = Math.max(FIRST_FREE_TICKET_EVENT_SLOT, count + 1);
  try {
    // Uses the phone's payment event id, so a retried push does not record it twice.
    await writeEvent(db, {
      id: item.paymentEventId,
      type: 'CORRECTION',
      ref: ticketEventRef(serialNumberOf(serial), slot),
      userId: auth.user.id,
      deviceId: auth.deviceId,
      ticketId: item.ticketId,
      details: {
        kind: 'second_payment_rejected',
        needsReview: true,
        reason: 'Ticket was already paid when this phone synced its own exit and payment',
        phoneExitAt: item.exitAt,
        phoneAmountCents: item.amountCents,
        phoneReceivedCents: item.payment.receivedCents,
        phonePaymentId: item.payment.id,
        ...skewDetails(ctx),
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}

async function applyClosed(ctx: PushContext, item: TicketClosedItem): Promise<PushResult> {
  const { db, auth } = ctx;
  const ticket = await db.ticket.findUnique({
    where: { id: item.ticketId },
    include: { payment: true },
  });
  if (!ticket) return { status: 'pending', message: 'Ticket not received yet' };
  if (!canRecordExit(auth, ticket)) throw new ApiError('FORBIDDEN', 'Not one of your areas');

  if (ticket.status === 'PAGO') {
    if (ticket.payment?.id === item.payment.id) return duplicate;
    await recordDoubleClose(ctx, item, ticket.serial);
    throw new ApiError('ALREADY_PAID', 'Ticket was already paid; a supervisor will review');
  }

  const exitAt = new Date(item.exitAt);
  if (exitAt < ticket.entryAt) throw new ApiError('BAD_REQUEST', 'Exit is before entry');
  if (item.payment.receivedCents < item.amountCents) {
    throw new ApiError('INSUFFICIENT_PAYMENT', 'Cash received is less than the amount charged');
  }

  // The cash was really taken: store what the phone charged, flag it if charging.ts disagrees.
  const rule = await getSetting(db, 'chargingRule');
  const server = calculateCharge(
    { entryAt: ticket.entryAt, exitAt, tariffCentsPerHour: ticket.tariffCentsPerHour },
    rule,
  );
  const mismatch =
    server.hoursCharged !== item.hoursCharged || server.amountCents !== item.amountCents
      ? {
          chargeMismatch: {
            expectedHours: server.hoursCharged,
            expectedAmountCents: server.amountCents,
          },
        }
      : {};

  const serialNumber = serialNumberOf(ticket.serial);
  const changeCents = item.payment.receivedCents - item.amountCents;

  const closed = await db.$transaction(async (tx) => {
    const { count } = await tx.ticket.updateMany({
      where: { id: ticket.id, status: 'ATIVO', exitAt: null },
      data: {
        exitAt,
        hoursCharged: item.hoursCharged,
        amountCents: item.amountCents,
        status: 'PAGO',
      },
    });
    if (count !== 1) return false;

    await tx.payment.create({
      data: {
        id: item.payment.id,
        ticketId: ticket.id,
        receiptNo: receiptNumber(serialNumber),
        amountCents: item.amountCents,
        method: item.payment.method,
        receivedAt: exitAt,
        agentId: auth.user.id,
      },
    });
    await writeEvent(tx, {
      id: item.exitEventId,
      type: 'EXIT',
      ref: ticketEventRef(serialNumber, TICKET_EVENT_SLOT.EXIT),
      at: exitAt,
      userId: auth.user.id,
      deviceId: auth.deviceId,
      ticketId: ticket.id,
      details: {
        exitAt: exitAt.toISOString(),
        durationMinutes: server.durationMinutes,
        hoursCharged: item.hoursCharged,
        tariffCentsPerHour: ticket.tariffCentsPerHour,
        amountCents: item.amountCents,
        chargingRule: rule,
        offline: true,
        ...mismatch,
        ...skewDetails(ctx),
      },
    });
    await writeEvent(tx, {
      id: item.paymentEventId,
      type: 'PAYMENT',
      ref: ticketEventRef(serialNumber, TICKET_EVENT_SLOT.PAYMENT),
      at: exitAt,
      userId: auth.user.id,
      deviceId: auth.deviceId,
      ticketId: ticket.id,
      details: {
        paymentId: item.payment.id,
        receiptNo: receiptNumber(serialNumber),
        method: item.payment.method,
        amountCents: item.amountCents,
        receivedCents: item.payment.receivedCents,
        changeCents,
        offline: true,
        ...skewDetails(ctx),
      },
    });
    return true;
  });

  if (!closed) {
    // Someone closed it between our read and our write.
    await recordDoubleClose(ctx, item, ticket.serial);
    throw new ApiError('ALREADY_PAID', 'Ticket was already paid; a supervisor will review');
  }
  return applied;
}

// ── SIGN_IN ─────────────────────────────────────────────────────────────────

async function applySignIn(ctx: PushContext, item: SignInItem): Promise<PushResult> {
  const { db, auth } = ctx;
  const existing = await db.event.findUnique({ where: { id: item.eventId } });
  if (existing) {
    if (existing.type === 'SIGN_IN' && existing.userId === auth.user.id) return duplicate;
    throw new ApiError('CONFLICT', 'Event id already used');
  }
  await writeEvent(db, {
    id: item.eventId,
    type: 'SIGN_IN',
    at: new Date(item.at),
    userId: auth.user.id,
    deviceId: auth.deviceId,
    details: {
      success: item.success,
      method: 'pin',
      offline: true,
      ...(item.reason ? { reason: item.reason } : {}),
      ...skewDetails(ctx),
    },
  });
  return applied;
}

// ── Batch ───────────────────────────────────────────────────────────────────

const ORDER: Record<PushItem['kind'], number> = { TICKET_ISSUED: 0, TICKET_CLOSED: 1, SIGN_IN: 2 };

/** Applies issues before closes so order inside a batch does not matter. */
export async function applyPush(ctx: PushContext, items: PushItem[]): Promise<PushResult[]> {
  const results: PushResult[] = new Array(items.length);
  const order = items.map((item, index) => ({ item, index }));
  order.sort((a, b) => ORDER[a.item.kind] - ORDER[b.item.kind] || a.index - b.index);

  for (const { item, index } of order) {
    try {
      switch (item.kind) {
        case 'TICKET_ISSUED':
          results[index] = await applyIssued(ctx, item);
          break;
        case 'TICKET_CLOSED':
          results[index] = await applyClosed(ctx, item);
          break;
        case 'SIGN_IN':
          results[index] = await applySignIn(ctx, item);
          break;
      }
    } catch (err) {
      if (err instanceof ApiError) {
        results[index] = rejected(err);
      } else if (isUniqueViolation(err)) {
        results[index] = rejected(new ApiError('CONFLICT', 'Serial or id already used'));
      } else {
        // A server bug must not lose data: the phone keeps the item and retries.
        ctx.log.error({ err, kind: item.kind }, 'sync item failed');
        results[index] = { status: 'pending', message: 'Server error; will retry' };
      }
    }
  }
  return results;
}
