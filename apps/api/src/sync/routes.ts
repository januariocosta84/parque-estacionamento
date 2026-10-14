// Sync API (M4): serial blocks, push, pull — docs/SYNC.md. Plus blocking a lost phone (FR-05).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  blockDeviceRequestSchema,
  diliDayRange,
  pullQuerySchema,
  pushRequestSchema,
} from '@estacionamento/shared';
import type { PullResponse, PushResponse, SerialBlocksResponse } from '@estacionamento/shared';
import { authOf, requireRole } from '../auth/guard';
import type { AuthContext } from '../auth/guard';
import type { Db } from '../db';
import { writeEvent } from '../events';
import { ApiError, parse } from '../http';
import { getSetting } from '../settings';
import { ticketVisibility } from '../tickets/access';
import { toTicket } from '../tickets/mapping';
import { ensureSerialBlocks } from './blocks';
import { applyPush } from './push';

/** Pull goes back this far before the cursor, so late-committing changes are not missed. */
const PULL_OVERLAP_MS = 60_000;
const PULL_LIMIT = 500;

function withDevice(auth: AuthContext): AuthContext & { deviceId: string } {
  if (!auth.deviceId) throw new ApiError('FORBIDDEN', 'Sync is only for registered phones');
  return { ...auth, deviceId: auth.deviceId };
}

export function registerSyncRoutes(app: FastifyInstance, db: Db) {
  const agentOnly = { preHandler: requireRole(db, 'agent') };

  app.post('/sync/serial-blocks', agentOnly, async (request): Promise<SerialBlocksResponse> => {
    const auth = withDevice(authOf(request));
    return { blocks: await ensureSerialBlocks(db, auth.deviceId, auth.user.id) };
  });

  app.post('/sync/push', agentOnly, async (request): Promise<PushResponse> => {
    const auth = withDevice(authOf(request));
    const body = parse(pushRequestSchema, request.body);

    const now = new Date();
    const skew = Math.round((Date.parse(body.deviceTime) - now.getTime()) / 1000);
    const warnAt = await getSetting(db, 'clockSkewWarnSeconds');

    const results = await applyPush(
      { db, auth, clockSkewSeconds: Math.abs(skew) > warnAt ? skew : undefined, log: request.log },
      body.items,
    );
    await db.device.update({ where: { id: auth.deviceId }, data: { lastSyncAt: now } });
    return { results, clockSkewSeconds: skew };
  });

  app.get('/sync/pull', agentOnly, async (request): Promise<PullResponse> => {
    const auth = withDevice(authOf(request));
    const { since } = parse(pullQuerySchema, request.query);
    const now = new Date();
    const from = since ? new Date(Date.parse(since) - PULL_OVERLAP_MS) : null;
    const visible = ticketVisibility(auth)!;

    // First pull: everything parked in my areas plus my own tickets from today.
    // Later pulls: whatever changed since the cursor.
    const changed = from
      ? { updatedAt: { gte: from } }
      : {
          OR: [
            { status: 'ATIVO' as const },
            { agentId: auth.user.id, entryAt: { gte: diliDayRange(now).start } },
          ],
        };

    const [
      areas,
      vehicleClasses,
      tariffs,
      chargingRule,
      pinMaxAttempts,
      clockSkewWarnSeconds,
      rows,
      closed,
    ] = await Promise.all([
      db.area.findMany({ where: { id: { in: auth.user.areaIds } }, orderBy: { name: 'asc' } }),
      db.vehicleClass.findMany({ orderBy: { code: 'asc' } }),
      db.tariff.findMany({ orderBy: { validFrom: 'asc' } }),
      getSetting(db, 'chargingRule'),
      getSetting(db, 'pinMaxAttempts'),
      getSetting(db, 'clockSkewWarnSeconds'),
      db.ticket.findMany({
        where: { AND: [visible, changed] },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: PULL_LIMIT + 1,
      }),
      from
        ? db.ticket.findMany({
            where: {
              areaId: { in: auth.user.areaIds },
              agentId: { not: auth.user.id },
              status: 'PAGO',
              updatedAt: { gte: from },
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    const hasMore = rows.length > PULL_LIMIT;
    const tickets = rows.slice(0, PULL_LIMIT);
    const cursor = hasMore ? tickets[tickets.length - 1]!.updatedAt : now;

    return {
      cursor: cursor.toISOString(),
      hasMore,
      areas,
      vehicleClasses,
      tariffs: tariffs.map((t) => ({
        id: t.id,
        vehicleClassId: t.vehicleClassId,
        centsPerHour: t.centsPerHour,
        validFrom: t.validFrom.toISOString(),
        validUntil: t.validUntil?.toISOString() ?? null,
        changedBy: t.changedById,
      })),
      settings: { chargingRule, pinMaxAttempts, clockSkewWarnSeconds },
      tickets: tickets.map(toTicket),
      closedTicketIds: closed.map((t) => t.id),
    };
  });

  // ── FR-05: block a lost or stolen phone ─────────────────────────────────
  app.post(
    '/devices/:id/block',
    { preHandler: requireRole(db, 'supervisor', 'admin') },
    async (request, reply) => {
      const actor = authOf(request).user;
      const { id } = parse(z.object({ id: z.uuid() }), request.params);
      const body = parse(blockDeviceRequestSchema, request.body);

      const device = await db.device.findUnique({
        where: { id },
        include: { user: { include: { areas: true } } },
      });
      if (!device) throw new ApiError('NOT_FOUND', 'Device not found');
      if (
        actor.role === 'supervisor' &&
        !device.user?.areas.some((a) => actor.areaIds.includes(a.areaId))
      ) {
        throw new ApiError('FORBIDDEN', 'Device is not used in one of your areas');
      }

      await db.$transaction(async (tx) => {
        await tx.device.update({ where: { id }, data: { status: 'BLOCKED' } });
        await tx.session.updateMany({
          where: { deviceId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await writeEvent(tx, {
          type: 'ADMIN_CHANGE',
          userId: actor.id,
          details: {
            action: 'block_device',
            deviceId: id,
            deviceUserId: device.userId,
            reason: body.reason,
          },
        });
      });
      return reply.status(204).send();
    },
  );
}
