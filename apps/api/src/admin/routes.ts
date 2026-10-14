// Admin (FR-28): accounts, areas, vehicle classes, tariffs. Admins only.
// Every change writes an ADMIN_CHANGE event in the same transaction (NFR-07).
// Nothing is deleted: accounts are locked, areas and classes deactivated, tariffs closed.
import type { FastifyInstance } from 'fastify';
import {
  createAreaRequestSchema,
  createUserRequestSchema,
  createVehicleClassRequestSchema,
  idParamsSchema,
  setTariffRequestSchema,
  tariffInForce,
  updateAreaRequestSchema,
  updateUserRequestSchema,
  updateVehicleClassRequestSchema,
} from '@estacionamento/shared';
import type { AdminCatalogResponse, AdminUser } from '@estacionamento/shared';
import { authOf, requireRole } from '../auth/guard';
import { hashSecret } from '../auth/secrets';
import type { Db } from '../db';
import { writeEvent } from '../events';
import type { Prisma } from '../generated/prisma/client';
import { ApiError, parse } from '../http';

const userInclude = { areas: true } as const;

function toAdminUser(u: Prisma.UserGetPayload<{ include: typeof userInclude }>): AdminUser {
  return {
    id: u.id,
    name: u.name,
    agentNumber: u.agentNumber,
    username: u.username,
    role: u.role,
    status: u.status,
    phone: u.phone,
    areaIds: u.areas.map((a) => a.areaId),
    createdAt: u.createdAt.toISOString(),
  };
}

export function registerAdminRoutes(app: FastifyInstance, db: Db) {
  const adminOnly = { preHandler: requireRole(db, 'admin') };

  async function assertAreas(areaIds: string[]) {
    const found = await db.area.count({ where: { id: { in: areaIds } } });
    if (found !== new Set(areaIds).size) throw new ApiError('BAD_REQUEST', 'areaIds: unknown area');
  }

  // ── Accounts ─────────────────────────────────────────────────────────────
  app.get('/admin/users', adminOnly, async () => {
    const users = await db.user.findMany({
      include: userInclude,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return { users: users.map(toAdminUser) };
  });

  app.post('/admin/users', adminOnly, async (request, reply) => {
    const actor = authOf(request).user;
    const body = parse(createUserRequestSchema, request.body);
    await assertAreas(body.areaIds);

    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data:
          body.role === 'agent'
            ? {
                name: body.name,
                role: 'agent',
                agentNumber: body.agentNumber,
                pinHash: await hashSecret(body.pin),
                phone: body.phone ?? null,
                areas: { create: body.areaIds.map((areaId) => ({ areaId })) },
              }
            : {
                name: body.name,
                role: body.role,
                username: body.username,
                passwordHash: await hashSecret(body.password),
                phone: body.phone,
                areas: { create: body.areaIds.map((areaId) => ({ areaId })) },
              },
        include: userInclude,
      });
      await writeEvent(tx, {
        type: 'ADMIN_CHANGE',
        userId: actor.id,
        details: {
          action: 'create_user',
          targetUserId: created.id,
          role: created.role,
          agentNumber: created.agentNumber,
          username: created.username,
          areaIds: body.areaIds,
        },
      });
      return created;
    });
    return reply.status(201).send(toAdminUser(user));
  });

  app.post('/admin/users/:id', adminOnly, async (request) => {
    const actor = authOf(request).user;
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(updateUserRequestSchema, request.body);
    if (id === actor.id && body.status === 'LOCKED') {
      throw new ApiError('BAD_REQUEST', 'You cannot lock your own account');
    }
    const before = await db.user.findUnique({ where: { id }, include: userInclude });
    if (!before) throw new ApiError('NOT_FOUND', 'User not found');
    if (body.areaIds) await assertAreas(body.areaIds);

    const user = await db.$transaction(async (tx) => {
      if (body.areaIds) {
        await tx.userArea.deleteMany({ where: { userId: id } });
        await tx.userArea.createMany({
          data: body.areaIds.map((areaId) => ({ userId: id, areaId })),
        });
      }
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          // Unlocking also clears the wrong-PIN count (FR-03).
          ...(body.status === 'ACTIVE' ? { failedPinAttempts: 0 } : {}),
        },
        include: userInclude,
      });
      if (body.status === 'LOCKED') {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      const after = toAdminUser(updated);
      const old = toAdminUser(before);
      const changed = (['name', 'phone', 'status', 'areaIds'] as const).filter(
        (k) => JSON.stringify(old[k]) !== JSON.stringify(after[k]),
      );
      await writeEvent(tx, {
        type: 'ADMIN_CHANGE',
        userId: actor.id,
        details: {
          action: 'update_user',
          targetUserId: id,
          reason: body.reason,
          changes: Object.fromEntries(changed.map((k) => [k, { from: old[k], to: after[k] }])),
        },
      });
      return after;
    });
    return user;
  });

  // ── Catalogue: areas, vehicle classes, tariffs ───────────────────────────
  app.get('/admin/catalog', adminOnly, async (): Promise<AdminCatalogResponse> => {
    const [areas, vehicleClasses, tariffs] = await Promise.all([
      db.area.findMany({ orderBy: { name: 'asc' } }),
      db.vehicleClass.findMany({ orderBy: { code: 'asc' } }),
      db.tariff.findMany({ orderBy: [{ vehicleClassId: 'asc' }, { validFrom: 'asc' }] }),
    ]);
    return {
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
    };
  });

  app.post('/admin/areas', adminOnly, async (request, reply) => {
    const actor = authOf(request).user;
    const body = parse(createAreaRequestSchema, request.body);
    const area = await db.$transaction(async (tx) => {
      const created = await tx.area.create({ data: { name: body.name } });
      await writeEvent(tx, {
        type: 'ADMIN_CHANGE',
        userId: actor.id,
        details: { action: 'create_area', areaId: created.id, name: created.name },
      });
      return created;
    });
    return reply.status(201).send(area);
  });

  app.post('/admin/areas/:id', adminOnly, async (request) => {
    const actor = authOf(request).user;
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(updateAreaRequestSchema, request.body);
    const before = await db.area.findUnique({ where: { id } });
    if (!before) throw new ApiError('NOT_FOUND', 'Area not found');
    return db.$transaction(async (tx) => {
      const after = await tx.area.update({ where: { id }, data: body });
      await writeEvent(tx, {
        type: 'ADMIN_CHANGE',
        userId: actor.id,
        details: { action: 'update_area', areaId: id, from: before, to: after },
      });
      return after;
    });
  });

  app.post('/admin/vehicle-classes', adminOnly, async (request, reply) => {
    const actor = authOf(request).user;
    const body = parse(createVehicleClassRequestSchema, request.body);
    const vc = await db.$transaction(async (tx) => {
      // New classes start inactive: they need a tariff first.
      const created = await tx.vehicleClass.create({ data: { ...body, active: false } });
      await writeEvent(tx, {
        type: 'ADMIN_CHANGE',
        userId: actor.id,
        details: { action: 'create_vehicle_class', vehicleClassId: created.id, code: created.code },
      });
      return created;
    });
    return reply.status(201).send(vc);
  });

  app.post('/admin/vehicle-classes/:id', adminOnly, async (request) => {
    const actor = authOf(request).user;
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(updateVehicleClassRequestSchema, request.body);
    const before = await db.vehicleClass.findUnique({ where: { id }, include: { tariffs: true } });
    if (!before) throw new ApiError('NOT_FOUND', 'Vehicle class not found');
    if (body.active === true && !tariffInForce(before.tariffs, id, new Date())) {
      throw new ApiError('NO_TARIFF', 'Set a tariff for this class before activating it');
    }
    const { tariffs: _tariffs, ...beforeClass } = before;
    return db.$transaction(async (tx) => {
      const after = await tx.vehicleClass.update({ where: { id }, data: body });
      await writeEvent(tx, {
        type: 'ADMIN_CHANGE',
        userId: actor.id,
        details: {
          action: 'update_vehicle_class',
          vehicleClassId: id,
          from: beforeClass,
          to: after,
        },
      });
      return after;
    });
  });

  app.post('/admin/tariffs', adminOnly, async (request, reply) => {
    const actor = authOf(request).user;
    const body = parse(setTariffRequestSchema, request.body);
    const now = new Date();
    const validFrom = body.validFrom ? new Date(body.validFrom) : now;
    // Tariff changes apply only to new tickets: no back-dating (FR-28, BR-04).
    if (validFrom.getTime() < now.getTime() - 60_000) {
      throw new ApiError('BAD_REQUEST', 'validFrom cannot be in the past');
    }
    const vc = await db.vehicleClass.findUnique({ where: { id: body.vehicleClassId } });
    if (!vc) throw new ApiError('BAD_REQUEST', 'vehicleClassId: unknown vehicle class');

    const tariff = await db.$transaction(async (tx) => {
      const open = await tx.tariff.findFirst({
        where: { vehicleClassId: vc.id, validUntil: null },
        orderBy: { validFrom: 'desc' },
      });
      if (open && open.validFrom >= validFrom) {
        throw new ApiError('BAD_REQUEST', 'A tariff already starts at or after validFrom');
      }
      if (open) await tx.tariff.update({ where: { id: open.id }, data: { validUntil: validFrom } });
      const created = await tx.tariff.create({
        data: {
          vehicleClassId: vc.id,
          centsPerHour: body.centsPerHour,
          validFrom,
          changedById: actor.id,
        },
      });
      await writeEvent(tx, {
        type: 'ADMIN_CHANGE',
        userId: actor.id,
        details: {
          action: 'set_tariff',
          vehicleClassId: vc.id,
          code: vc.code,
          centsPerHour: body.centsPerHour,
          validFrom: validFrom.toISOString(),
          previous: open ? { tariffId: open.id, centsPerHour: open.centsPerHour } : null,
          reason: body.reason,
        },
      });
      return created;
    });
    return reply.status(201).send({
      id: tariff.id,
      vehicleClassId: tariff.vehicleClassId,
      centsPerHour: tariff.centsPerHour,
      validFrom: tariff.validFrom.toISOString(),
      validUntil: null,
      changedBy: tariff.changedById,
    });
  });
}
