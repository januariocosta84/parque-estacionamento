// Read-only views for the console (M7): reference lists, live totals, audit log, daily report.
// Supervisors only ever see their own areas; finance, auditors and admins see all areas.
import type { FastifyInstance } from 'fastify';
import {
  consoleFiltersSchema,
  diliDayRange,
  formatDiliDate,
  listEventsQuerySchema,
} from '@estacionamento/shared';
import type {
  ConsoleFilters,
  DailyReportResponse,
  ListEventsResponse,
  MonitorResponse,
  ReferenceResponse,
} from '@estacionamento/shared';
import { CONSOLE_ROLES, authOf, requireRole } from '../auth/guard';
import type { AuthContext } from '../auth/guard';
import type { Db } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { ApiError, parse } from '../http';

/** Areas this user may see, or null for all. */
export function areaScope(auth: AuthContext): string[] | null {
  return auth.user.role === 'supervisor' ? auth.user.areaIds : null;
}

/** The areas a query covers: the filter (if allowed) within the user's scope. */
function areasFor(auth: AuthContext, areaId?: string): string[] | null {
  const scope = areaScope(auth);
  if (areaId) {
    if (scope && !scope.includes(areaId)) throw new ApiError('FORBIDDEN', 'Not one of your areas');
    return [areaId];
  }
  return scope;
}

const todayIso = (now: Date) => {
  const [dd, mm, yyyy] = formatDiliDate(now).split('/');
  return `${yyyy}-${mm}-${dd}`;
};

function dayOf(date: string | undefined, now: Date) {
  const iso = date ?? todayIso(now);
  return { iso, ...diliDayRange(new Date(`${iso}T12:00:00+09:00`)) };
}

function ticketFilter(areas: string[] | null, filters: ConsoleFilters): Prisma.TicketWhereInput {
  return {
    ...(areas ? { areaId: { in: areas } } : {}),
    ...(filters.agentId ? { agentId: filters.agentId } : {}),
  };
}

export function registerConsoleRoutes(app: FastifyInstance, db: Db) {
  // ── Lists for the filters (FR-21) ────────────────────────────────────────
  app.get(
    '/reference',
    { preHandler: requireRole(db, ...CONSOLE_ROLES) },
    async (request): Promise<ReferenceResponse> => {
      const scope = areaScope(authOf(request));
      const [areas, vehicleClasses, agents] = await Promise.all([
        db.area.findMany({ where: scope ? { id: { in: scope } } : {}, orderBy: { name: 'asc' } }),
        db.vehicleClass.findMany({ orderBy: { code: 'asc' } }),
        db.user.findMany({
          where: {
            role: 'agent',
            ...(scope ? { areas: { some: { areaId: { in: scope } } } } : {}),
          },
          include: { areas: true },
          orderBy: { agentNumber: 'asc' },
        }),
      ]);
      return {
        areas,
        vehicleClasses,
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          agentNumber: a.agentNumber,
          areaIds: a.areas.map((x) => x.areaId),
        })),
      };
    },
  );

  // ── Live totals (FR-20) ──────────────────────────────────────────────────
  app.get(
    '/monitor',
    { preHandler: requireRole(db, 'supervisor', 'finance', 'auditor') },
    async (request): Promise<MonitorResponse> => {
      const auth = authOf(request);
      const filters = parse(consoleFiltersSchema, request.query);
      const now = new Date();
      const day = dayOf(filters.date, now);
      const base = ticketFilter(areasFor(auth, filters.areaId), filters);
      const inDay = { gte: day.start, lt: day.end };

      const [parked, byClass, issued, issuedActive, exits, received] = await Promise.all([
        db.ticket.count({ where: { ...base, status: 'ATIVO' } }),
        db.ticket.groupBy({
          by: ['vehicleClassId'],
          where: { ...base, status: 'ATIVO' },
          _count: { _all: true },
        }),
        db.ticket.count({ where: { ...base, entryAt: inDay } }),
        db.ticket.count({ where: { ...base, entryAt: inDay, status: 'ATIVO' } }),
        db.ticket.count({ where: { ...base, exitAt: inDay } }),
        db.payment.aggregate({
          where: {
            receivedAt: inDay,
            ticket: { ...(base.areaId ? { areaId: base.areaId } : {}) },
            ...(filters.agentId ? { agentId: filters.agentId } : {}),
          },
          _sum: { amountCents: true },
          _count: { _all: true },
        }),
      ]);

      return {
        date: day.iso,
        generatedAt: now.toISOString(),
        parked: {
          count: parked,
          byClass: byClass.map((g) => ({ vehicleClassId: g.vehicleClassId, count: g._count._all })),
        },
        received: { amountCents: received._sum.amountCents ?? 0, payments: received._count._all },
        issued: { count: issued, active: issuedActive, paid: issued - issuedActive },
        exits,
      };
    },
  );

  // ── Audit log and recent activity (FR-26, NFR-07) ────────────────────────
  app.get(
    '/events',
    { preHandler: requireRole(db, 'supervisor', 'auditor', 'admin') },
    async (request): Promise<ListEventsResponse> => {
      const auth = authOf(request);
      const query = parse(listEventsQuerySchema, request.query);
      const areas = areasFor(auth, query.areaId);
      const day = query.date ? dayOf(query.date, new Date()) : null;

      const filters: Prisma.EventWhereInput[] = [];
      if (areas) {
        // Events on tickets in these areas, and events by agents who work in them (sign-ins).
        filters.push({
          OR: [
            { ticket: { areaId: { in: areas } } },
            { ticketId: null, user: { areas: { some: { areaId: { in: areas } } } } },
          ],
        });
      }
      if (day) filters.push({ at: { gte: day.start, lt: day.end } });
      if (query.agentId) filters.push({ userId: query.agentId });
      if (query.type) filters.push({ type: query.type });
      if (query.q) {
        const q = query.q.toUpperCase();
        filters.push({
          OR: [
            { ref: { contains: q } },
            { ticket: { plate: { contains: q } } },
            { ticket: { serial: { contains: q } } },
          ],
        });
      }
      const where = { AND: filters };

      const [rows, total] = await Promise.all([
        db.event.findMany({
          where,
          orderBy: [{ at: 'desc' }, { ref: 'desc' }],
          take: query.limit,
          skip: query.offset,
          include: {
            user: { select: { id: true, name: true, agentNumber: true, username: true } },
            ticket: { select: { id: true, serial: true, plate: true } },
          },
        }),
        db.event.count({ where }),
      ]);

      return {
        total,
        items: rows.map((e) => ({
          id: e.id,
          ref: e.ref,
          type: e.type,
          at: e.at.toISOString(),
          user: e.user,
          deviceId: e.deviceId,
          ticket: e.ticket,
          details: (e.details ?? {}) as Record<string, unknown>,
        })),
      };
    },
  );

  // ── Daily revenue per agent and per area (FR-25) ─────────────────────────
  app.get(
    '/reports/daily',
    { preHandler: requireRole(db, 'supervisor', 'finance', 'auditor') },
    async (request): Promise<DailyReportResponse> => {
      const auth = authOf(request);
      const filters = parse(consoleFiltersSchema, request.query);
      const day = dayOf(filters.date, new Date());
      const areas = areasFor(auth, filters.areaId);
      const inDay = { gte: day.start, lt: day.end };

      const [payments, issued, stillParked] = await Promise.all([
        db.payment.findMany({
          where: {
            receivedAt: inDay,
            ...(areas ? { ticket: { areaId: { in: areas } } } : {}),
            ...(filters.agentId ? { agentId: filters.agentId } : {}),
          },
          select: {
            amountCents: true,
            agent: { select: { id: true, name: true, agentNumber: true } },
            ticket: { select: { area: { select: { id: true, name: true } } } },
          },
        }),
        db.ticket.count({ where: { ...ticketFilter(areas, filters), entryAt: inDay } }),
        db.ticket.count({
          where: { ...ticketFilter(areas, filters), entryAt: inDay, status: 'ATIVO' },
        }),
      ]);

      const byAgent = new Map<string, DailyReportResponse['byAgent'][number]>();
      const byArea = new Map<string, DailyReportResponse['byArea'][number]>();
      for (const p of payments) {
        const a = byAgent.get(p.agent.id) ?? {
          agentId: p.agent.id,
          name: p.agent.name,
          agentNumber: p.agent.agentNumber,
          payments: 0,
          amountCents: 0,
        };
        a.payments += 1;
        a.amountCents += p.amountCents;
        byAgent.set(a.agentId, a);

        const area = p.ticket.area;
        const r = byArea.get(area.id) ?? {
          areaId: area.id,
          name: area.name,
          payments: 0,
          amountCents: 0,
        };
        r.payments += 1;
        r.amountCents += p.amountCents;
        byArea.set(r.areaId, r);
      }

      return {
        date: day.iso,
        total: {
          payments: payments.length,
          amountCents: payments.reduce((sum, p) => sum + p.amountCents, 0),
          issued,
          stillParked,
        },
        byAgent: [...byAgent.values()].sort((x, y) =>
          (x.agentNumber ?? '').localeCompare(y.agentNumber ?? ''),
        ),
        byArea: [...byArea.values()].sort((x, y) => x.name.localeCompare(y.name)),
      };
    },
  );
}
