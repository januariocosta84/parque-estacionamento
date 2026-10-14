// Ticket API (M3): issue, quote, exit + payment, find/list, receipt, agent's day totals.
// Every change writes an Event in the same transaction (CLAUDE.md rule 5).
import type { FastifyInstance } from 'fastify';
import {
  TICKET_EVENT_SLOT,
  calculateCharge,
  diliDayRange,
  formatDiliDate,
  issueTicketRequestSchema,
  listTicketsQuerySchema,
  parseSerial,
  receiptNumber,
  recordExitRequestSchema,
  tariffInForce,
  ticketEventRef,
  ticketIdParamsSchema,
} from '@estacionamento/shared';
import type {
  ChargeQuote,
  ListTicketsResponse,
  Receipt,
  TicketView,
  TodaySummary,
} from '@estacionamento/shared';
import { authOf, requireRole } from '../auth/guard';
import type { AuthContext } from '../auth/guard';
import type { Db } from '../db';
import { writeEvent } from '../events';
import { ApiError, parse } from '../http';
import { getSetting } from '../settings';
import { canRecordExit, canSeeTicket, ticketVisibility } from './access';
import { ALL_COPIES, serialNumberOf, toReceipt, toTicket, toTicketView } from './mapping';

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2002';
}

/** "2026-10-13" → the UTC bounds of that Dili day. */
function diliDay(date: string) {
  return diliDayRange(new Date(`${date}T12:00:00+09:00`));
}

export function registerTicketRoutes(app: FastifyInstance, db: Db) {
  async function loadVisibleTicket(auth: AuthContext, id: string) {
    const ticket = await db.ticket.findUnique({ where: { id } });
    if (!ticket || !canSeeTicket(auth, ticket)) throw new ApiError('NOT_FOUND', 'Ticket not found');
    return ticket;
  }

  async function loadReceipt(ticketId: string): Promise<Receipt> {
    const ticket = await db.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: {
        payment: { include: { agent: { select: { id: true, name: true, agentNumber: true } } } },
        events: { where: { type: 'PAYMENT' }, take: 1 },
      },
    });
    if (!ticket.payment) throw new ApiError('NOT_FOUND', 'Ticket is not paid yet');
    return toReceipt(ticket, ticket.payment, ticket.events[0]?.details);
  }

  function quote(
    entryAt: Date,
    tariffCentsPerHour: number,
    rule: { minimumHours: number; graceMinutes: number },
  ) {
    // System clock, never typed (BR-09). A ticket from a phone whose clock was fast can have an
    // entry in the future; never exit before entry, so it is charged the minimum, not rejected.
    const exitAt = new Date(Math.max(Date.now(), entryAt.getTime()));
    return { exitAt, ...calculateCharge({ entryAt, exitAt, tariffCentsPerHour }, rule) };
  }

  // ── Issue (FR-06, FR-07, FR-08, FR-10) ───────────────────────────────────
  app.post('/tickets', { preHandler: requireRole(db, 'agent') }, async (request, reply) => {
    const auth = authOf(request);
    const body = parse(issueTicketRequestSchema, request.body);
    const { user, deviceId } = auth;
    if (!deviceId) throw new ApiError('FORBIDDEN', 'Tickets are issued from a registered phone');

    // Retried request: return the ticket already created with this id.
    const existing = await db.ticket.findUnique({ where: { id: body.id } });
    if (existing) {
      if (existing.agentId !== user.id) throw new ApiError('CONFLICT', 'Ticket id already used');
      return reply.status(200).send(toTicketView(existing));
    }

    const serialNumber = parseSerial(body.serial)!;
    const block = await db.serialBlock.findFirst({
      where: { deviceId, start: { lte: serialNumber }, end: { gte: serialNumber } },
    });
    if (!block) {
      throw new ApiError(
        'SERIAL_NOT_ALLOCATED',
        'Serial is not in a block allocated to this phone',
      );
    }

    const areaId = body.areaId ?? (user.areaIds.length === 1 ? user.areaIds[0] : undefined);
    if (!areaId) throw new ApiError('BAD_REQUEST', 'areaId: choose one of your areas');
    if (!user.areaIds.includes(areaId)) throw new ApiError('FORBIDDEN', 'Not one of your areas');

    const vehicleClass = await db.vehicleClass.findUnique({ where: { id: body.vehicleClassId } });
    if (!vehicleClass) throw new ApiError('BAD_REQUEST', 'vehicleClassId: unknown vehicle class');
    if (!vehicleClass.active) {
      throw new ApiError('VEHICLE_CLASS_INACTIVE', 'This vehicle class is not in use yet');
    }

    const entryAt = new Date(); // system clock (BR-09)
    const tariffs = await db.tariff.findMany({ where: { vehicleClassId: vehicleClass.id } });
    const tariff = tariffInForce(tariffs, vehicleClass.id, entryAt);
    if (!tariff) throw new ApiError('NO_TARIFF', 'No tariff in force for this vehicle class');

    try {
      const ticket = await db.$transaction(async (tx) => {
        const created = await tx.ticket.create({
          data: {
            id: body.id,
            serial: body.serial,
            plate: body.plate,
            vehicleClassId: vehicleClass.id,
            areaId,
            agentId: user.id,
            deviceId,
            entryAt,
            tariffCentsPerHour: tariff.centsPerHour, // BR-04: fixed at issue
            driverPhone: body.driverPhone ?? null,
          },
        });
        await writeEvent(tx, {
          type: 'ISSUE',
          ref: ticketEventRef(serialNumber, TICKET_EVENT_SLOT.ISSUE),
          at: entryAt,
          userId: user.id,
          deviceId,
          ticketId: created.id,
          details: {
            serial: created.serial,
            plate: created.plate,
            vehicleClassId: created.vehicleClassId,
            areaId,
            tariffCentsPerHour: created.tariffCentsPerHour,
            copies: ALL_COPIES,
          },
        });
        return created;
      });
      return reply.status(201).send(toTicketView(ticket));
    } catch (err) {
      if (isUniqueViolation(err)) throw new ApiError('CONFLICT', 'Serial already used');
      throw err;
    }
  });

  // ── Quote: what is due if the vehicle leaves now (FR-14) ──────────────────
  app.get(
    '/tickets/:id/charge',
    { preHandler: requireRole(db, 'agent', 'supervisor') },
    async (request): Promise<ChargeQuote> => {
      const auth = authOf(request);
      const { id } = parse(ticketIdParamsSchema, request.params);
      const ticket = await loadVisibleTicket(auth, id);
      if (!canRecordExit(auth, ticket)) throw new ApiError('FORBIDDEN', 'Not one of your areas');
      if (ticket.status === 'PAGO') throw new ApiError('ALREADY_PAID', 'Ticket is already paid');

      const rule = await getSetting(db, 'chargingRule');
      const q = quote(ticket.entryAt, ticket.tariffCentsPerHour, rule);
      return {
        ticketId: ticket.id,
        entryAt: ticket.entryAt.toISOString(),
        exitAt: q.exitAt.toISOString(),
        durationMinutes: q.durationMinutes,
        hoursCharged: q.hoursCharged,
        tariffCentsPerHour: q.tariffCentsPerHour,
        amountCents: q.amountCents,
      };
    },
  );

  // ── Exit + cash payment in one step (FR-14–17, docs/DECISIONS.md) ─────────
  app.post(
    '/tickets/:id/exit',
    { preHandler: requireRole(db, 'agent', 'supervisor') },
    async (request): Promise<Receipt> => {
      const auth = authOf(request);
      const { id } = parse(ticketIdParamsSchema, request.params);
      const body = parse(recordExitRequestSchema, request.body);

      const ticket = await db.ticket.findUnique({ where: { id }, include: { payment: true } });
      if (!ticket || !canSeeTicket(auth, ticket)) {
        // A paid ticket may be hidden from an agent, but a retry of their own payment is fine.
        if (ticket?.payment?.id === body.paymentId) return loadReceipt(ticket.id);
        throw new ApiError('NOT_FOUND', 'Ticket not found');
      }
      if (ticket.status === 'PAGO') {
        if (ticket.payment?.id === body.paymentId) return loadReceipt(ticket.id); // retry
        throw new ApiError('ALREADY_PAID', 'Ticket is already paid and closed');
      }
      if (!canRecordExit(auth, ticket)) throw new ApiError('FORBIDDEN', 'Not one of your areas');

      const rule = await getSetting(db, 'chargingRule');
      const q = quote(ticket.entryAt, ticket.tariffCentsPerHour, rule);
      if (q.amountCents !== body.expectedAmountCents) {
        throw new ApiError('CHARGE_CHANGED', 'The charge changed; show the driver the new total', {
          quote: {
            exitAt: q.exitAt.toISOString(),
            durationMinutes: q.durationMinutes,
            hoursCharged: q.hoursCharged,
            tariffCentsPerHour: q.tariffCentsPerHour,
            amountCents: q.amountCents,
          },
        });
      }
      if (body.receivedCents < q.amountCents) {
        throw new ApiError('INSUFFICIENT_PAYMENT', 'Cash received is less than the amount due');
      }

      const serialNumber = serialNumberOf(ticket.serial);
      const changeCents = body.receivedCents - q.amountCents;
      const { user, deviceId } = auth;

      try {
        await db.$transaction(async (tx) => {
          // Only an active ticket without an exit can be closed; guards against a race.
          const { count } = await tx.ticket.updateMany({
            where: { id: ticket.id, status: 'ATIVO', exitAt: null },
            data: {
              exitAt: q.exitAt,
              hoursCharged: q.hoursCharged,
              amountCents: q.amountCents,
              status: 'PAGO',
            },
          });
          if (count !== 1) throw new ApiError('ALREADY_PAID', 'Ticket is already paid and closed');

          await tx.payment.create({
            data: {
              id: body.paymentId,
              ticketId: ticket.id,
              receiptNo: receiptNumber(serialNumber),
              amountCents: q.amountCents,
              method: body.method,
              receivedAt: q.exitAt,
              agentId: user.id,
            },
          });
          await writeEvent(tx, {
            type: 'EXIT',
            ref: ticketEventRef(serialNumber, TICKET_EVENT_SLOT.EXIT),
            at: q.exitAt,
            userId: user.id,
            deviceId,
            ticketId: ticket.id,
            details: {
              exitAt: q.exitAt.toISOString(),
              durationMinutes: q.durationMinutes,
              hoursCharged: q.hoursCharged,
              tariffCentsPerHour: q.tariffCentsPerHour,
              amountCents: q.amountCents,
              chargingRule: rule,
            },
          });
          await writeEvent(tx, {
            type: 'PAYMENT',
            ref: ticketEventRef(serialNumber, TICKET_EVENT_SLOT.PAYMENT),
            at: q.exitAt,
            userId: user.id,
            deviceId,
            ticketId: ticket.id,
            details: {
              paymentId: body.paymentId,
              receiptNo: receiptNumber(serialNumber),
              method: body.method,
              amountCents: q.amountCents,
              receivedCents: body.receivedCents,
              changeCents,
            },
          });
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw new ApiError('CONFLICT', 'Payment id already used');
        throw err;
      }

      return loadReceipt(ticket.id);
    },
  );

  // ── One ticket, and its receipt (FR-13, FR-16) ───────────────────────────
  app.get(
    '/tickets/:id',
    { preHandler: requireRole(db, 'agent', 'supervisor', 'finance', 'auditor') },
    async (request): Promise<TicketView> => {
      const { id } = parse(ticketIdParamsSchema, request.params);
      return toTicketView(await loadVisibleTicket(authOf(request), id));
    },
  );

  app.get(
    '/tickets/:id/receipt',
    { preHandler: requireRole(db, 'agent', 'supervisor', 'finance', 'auditor') },
    async (request): Promise<Receipt> => {
      const { id } = parse(ticketIdParamsSchema, request.params);
      const ticket = await loadVisibleTicket(authOf(request), id);
      return loadReceipt(ticket.id);
    },
  );

  // ── Find / list (FR-13, FR-18, FR-21, FR-23) ─────────────────────────────
  app.get(
    '/tickets',
    { preHandler: requireRole(db, 'agent', 'supervisor', 'finance', 'auditor') },
    async (request): Promise<ListTicketsResponse> => {
      const auth = authOf(request);
      const query = listTicketsQuerySchema.safeParse(request.query);
      if (!query.success)
        throw new ApiError('BAD_REQUEST', query.error.issues[0]?.message ?? 'Bad query');
      const { status, q, date, areaId, agentId, order, limit, offset } = query.data;

      const visibility = ticketVisibility(auth);
      if (!visibility) throw new ApiError('FORBIDDEN', 'Your role may not list tickets');

      const filters = [
        visibility,
        status ? { status } : {},
        areaId ? { areaId } : {},
        agentId ? { agentId } : {},
        date ? { entryAt: { gte: diliDay(date).start, lt: diliDay(date).end } } : {},
        q
          ? {
              OR: [
                { plate: { contains: q.toUpperCase() } },
                { serial: { contains: q.toUpperCase() } },
              ],
            }
          : {},
      ];
      const where = { AND: filters };

      const [rows, total] = await Promise.all([
        db.ticket.findMany({
          where,
          orderBy: [{ entryAt: order === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }],
          take: limit,
          skip: offset,
          include: {
            events: {
              select: { ref: true },
              // Exit and payment share a timestamp; within a ticket, refs sort -01 < -02 < -03.
              orderBy: [{ at: 'desc' }, { ref: 'desc' }],
              take: 1,
            },
          },
        }),
        db.ticket.count({ where }),
      ]);

      return {
        total,
        items: rows.map((row) => {
          const issueRef = ticketEventRef(serialNumberOf(row.serial), TICKET_EVENT_SLOT.ISSUE);
          return { ...toTicket(row), issueRef, lastEventRef: row.events[0]?.ref ?? issueRef };
        }),
      };
    },
  );

  // ── Agent's own day (FR-19) ──────────────────────────────────────────────
  app.get(
    '/me/today',
    { preHandler: requireRole(db, 'agent') },
    async (request): Promise<TodaySummary> => {
      const { user } = authOf(request);
      const now = new Date();
      const { start, end } = diliDayRange(now);
      const [parkedCount, received] = await Promise.all([
        db.ticket.count({ where: { agentId: user.id, status: 'ATIVO' } }),
        db.payment.aggregate({
          where: { agentId: user.id, receivedAt: { gte: start, lt: end } },
          _sum: { amountCents: true },
        }),
      ]);
      const [dd, mm, yyyy] = formatDiliDate(now).split('/');
      return {
        date: `${yyyy}-${mm}-${dd}`,
        parkedCount,
        receivedTodayCents: received._sum.amountCents ?? 0,
      };
    },
  );
}
