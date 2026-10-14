// M7 admin (FR-28): accounts, areas, vehicle classes and tariffs; every change is logged.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminCatalogResponseSchema,
  adminUserSchema,
  adminUsersResponseSchema,
  tariffSchema,
  ticketViewSchema,
} from '@estacionamento/shared';
import { buildApp } from '../src/app';
import type { Db } from '../src/db';
import { MemorySmsSender } from '../src/sms';
import {
  agentOnPhone,
  consoleSession,
  createArea,
  hasTestDb,
  newDeviceId,
  seedTestDb,
  testDb,
  unique,
} from './helpers';

describe.skipIf(!hasTestDb)('admin (FR-28)', () => {
  let db: Db;
  let sms: MemorySmsSender;
  let app: ReturnType<typeof buildApp>;
  let admin: Awaited<ReturnType<typeof consoleSession>>;

  beforeAll(async () => {
    db = testDb();
    await seedTestDb(db);
    sms = new MemorySmsSender();
    app = buildApp({ db, sms });
    admin = await consoleSession(app, db, sms, 'admin');
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  const post = (url: string, payload: object, headers: Record<string, string> = admin.headers) =>
    app.inject({ method: 'POST', url, headers, payload });
  const lastAdminEvent = () =>
    db.event.findFirstOrThrow({
      where: { userId: admin.user.id, type: 'ADMIN_CHANGE' },
      orderBy: { receivedAt: 'desc' },
    });

  it('only admins may use admin routes', async () => {
    const supervisor = await consoleSession(app, db, sms, 'supervisor');
    expect(
      (await app.inject({ method: 'GET', url: '/admin/users', headers: supervisor.headers }))
        .statusCode,
    ).toBe(403);
    expect((await post('/admin/areas', { name: 'X' }, supervisor.headers)).statusCode).toBe(403);
  });

  describe('accounts', () => {
    it('creates an agent who can then sign in with the PIN; logged; no duplicate numbers', async () => {
      const area = await createArea(db);
      const agentNumber = `amd-${unique().slice(-4)}`;
      const res = await post('/admin/users', {
        role: 'agent',
        name: 'Novo Agente',
        agentNumber,
        pin: '135790',
        areaIds: [area.id],
      });
      expect(res.statusCode).toBe(201);
      const user = adminUserSchema.parse(res.json());
      expect(user).toMatchObject({
        agentNumber: agentNumber.toUpperCase(),
        role: 'agent',
        areaIds: [area.id],
      });
      expect(JSON.stringify(res.json())).not.toMatch(/hash|135790/);

      const login = await post(
        '/auth/agent/login',
        { agentNumber, pin: '135790', deviceId: newDeviceId() },
        {},
      );
      expect(login.statusCode).toBe(200);
      expect((await lastAdminEvent()).details).toMatchObject({
        action: 'create_user',
        targetUserId: user.id,
      });

      const again = await post('/admin/users', {
        role: 'agent',
        name: 'X',
        agentNumber,
        pin: '135790',
        areaIds: [area.id],
      });
      expect(again.statusCode).toBe(409);
    });

    it('console users need a 12+ character password and a phone for the SMS code', async () => {
      const base = {
        role: 'finance',
        name: 'Fin',
        username: `fin-${unique()}`.toLowerCase(),
        areaIds: [],
      };
      expect(
        (await post('/admin/users', { ...base, password: 'short', phone: '+67077000000' }))
          .statusCode,
      ).toBe(400);
      expect(
        (await post('/admin/users', { ...base, password: 'long-enough-password' })).statusCode,
      ).toBe(400);
      expect(
        (
          await post('/admin/users', {
            ...base,
            password: 'long-enough-password',
            phone: '+67077000000',
          })
        ).statusCode,
      ).toBe(201);
    });

    it('locking ends the user’s sessions; unlocking clears wrong PINs; changes are logged with a reason', async () => {
      const moto = (await db.vehicleClass.findUniqueOrThrow({ where: { code: 'MOTORIZADA' } })).id;
      const agent = await agentOnPhone(app, db, 'Setor A', moto);
      await db.user.update({ where: { id: agent.agent.id }, data: { failedPinAttempts: 3 } });

      const lock = await post(`/admin/users/${agent.agent.id}`, {
        status: 'LOCKED',
        reason: 'Left the job',
      });
      expect(lock.statusCode).toBe(200);
      expect(
        (await app.inject({ method: 'GET', url: '/me', headers: agent.headers })).statusCode,
      ).toBe(401);
      expect((await lastAdminEvent()).details).toMatchObject({
        action: 'update_user',
        reason: 'Left the job',
        changes: { status: { from: 'ACTIVE', to: 'LOCKED' } },
      });

      await post(`/admin/users/${agent.agent.id}`, { status: 'ACTIVE', reason: 'Back' });
      expect(await db.user.findUniqueOrThrow({ where: { id: agent.agent.id } })).toMatchObject({
        status: 'ACTIVE',
        failedPinAttempts: 0,
      });
    });

    it('an admin cannot lock their own account, and a reason is required', async () => {
      expect(
        (await post(`/admin/users/${admin.user.id}`, { status: 'LOCKED', reason: 'x' })).statusCode,
      ).toBe(400);
      expect((await post(`/admin/users/${admin.user.id}`, { name: 'New name' })).statusCode).toBe(
        400,
      );
    });

    it('lists users without secrets', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/users', headers: admin.headers });
      const { users } = adminUsersResponseSchema.parse(res.json());
      expect(users.length).toBeGreaterThan(1);
      expect(JSON.stringify(res.json())).not.toMatch(/hash/i);
    });
  });

  describe('areas and vehicle classes', () => {
    it('creates and deactivates an area (never deletes); both logged', async () => {
      const name = `Zona ${unique()}`;
      const created = await post('/admin/areas', { name });
      expect(created.statusCode).toBe(201);
      const id = (created.json() as { id: string }).id;
      const off = await post(`/admin/areas/${id}`, { active: false });
      expect(off.json()).toMatchObject({ id, active: false });
      expect((await lastAdminEvent()).details).toMatchObject({ action: 'update_area', areaId: id });
    });

    it('a new class starts inactive and cannot be activated without a tariff', async () => {
      const code = `c_${unique()}`;
      const created = await post('/admin/vehicle-classes', {
        code,
        namePt: 'Classe',
        nameTet: 'Klase',
      });
      expect(created.json()).toMatchObject({ code: code.toUpperCase(), active: false });
      const id = (created.json() as { id: string }).id;

      const activate = await post(`/admin/vehicle-classes/${id}`, { active: true });
      expect(activate.statusCode).toBe(422);
      expect(activate.json().error).toBe('NO_TARIFF');

      expect(
        (
          await post('/admin/tariffs', {
            vehicleClassId: id,
            centsPerHour: 100,
            reason: 'Decided by AMD',
          })
        ).statusCode,
      ).toBe(201);
      expect((await post(`/admin/vehicle-classes/${id}`, { active: true })).json()).toMatchObject({
        active: true,
      });
    });
  });

  describe('tariffs (BR-04)', () => {
    it('a new tariff closes the old one and applies only to tickets issued after it', async () => {
      const vc = (
        await post('/admin/vehicle-classes', { code: `t_${unique()}`, namePt: 'T', nameTet: 'T' })
      ).json() as { id: string };
      await post('/admin/tariffs', { vehicleClassId: vc.id, centsPerHour: 50, reason: 'start' });
      await post(`/admin/vehicle-classes/${vc.id}`, { active: true });

      const area = await createArea(db);
      const phone = await agentOnPhone(app, db, area.name, vc.id);
      const before = await phone.issue();
      expect(before).toBeTruthy();

      const change = await post('/admin/tariffs', {
        vehicleClassId: vc.id,
        centsPerHour: 75,
        reason: 'Council decision',
      });
      expect(tariffSchema.parse(change.json()).centsPerHour).toBe(75);

      const after = await phone.issue();
      const view = (id: string) =>
        app
          .inject({ method: 'GET', url: `/tickets/${id}`, headers: phone.headers })
          .then((r) => ticketViewSchema.parse(r.json()));
      expect((await view(before.id)).ticket.tariffCentsPerHour).toBe(50);
      expect((await view(after.id)).ticket.tariffCentsPerHour).toBe(75);

      const catalog = adminCatalogResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/admin/catalog', headers: admin.headers })).json(),
      );
      const periods = catalog.tariffs.filter((t) => t.vehicleClassId === vc.id);
      expect(periods.map((t) => [t.centsPerHour, t.validUntil === null])).toEqual([
        [50, false],
        [75, true],
      ]);
      expect((await lastAdminEvent()).details).toMatchObject({
        action: 'set_tariff',
        centsPerHour: 75,
        previous: { centsPerHour: 50 },
        reason: 'Council decision',
      });
    });

    it('refuses back-dated tariffs and money that is not whole cents', async () => {
      const moto = (await db.vehicleClass.findUniqueOrThrow({ where: { code: 'MOTORIZADA' } })).id;
      const past = await post('/admin/tariffs', {
        vehicleClassId: moto,
        centsPerHour: 60,
        validFrom: '2020-01-01T00:00:00Z',
        reason: 'x',
      });
      expect(past.statusCode).toBe(400);
      expect(
        (await post('/admin/tariffs', { vehicleClassId: moto, centsPerHour: 0.5, reason: 'x' }))
          .statusCode,
      ).toBe(400);
    });
  });
});
