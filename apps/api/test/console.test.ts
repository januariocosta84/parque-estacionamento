// M7 console read views: reference, live totals, audit log, daily report — and their scoping.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  dailyReportResponseSchema,
  listEventsResponseSchema,
  monitorResponseSchema,
  referenceResponseSchema,
} from '@estacionamento/shared';
import { buildApp } from '../src/app';
import type { Db } from '../src/db';
import { MemorySmsSender } from '../src/sms';
import { agentOnPhone, consoleSession, createArea, hasTestDb, seedTestDb, testDb } from './helpers';

describe.skipIf(!hasTestDb)('console views (M7)', () => {
  let db: Db;
  let sms: MemorySmsSender;
  let app: ReturnType<typeof buildApp>;
  let moto: string;
  /** Area X: only this file's tickets live here, so every total below is exact. */
  let areaX: { id: string; name: string };
  let a1: Awaited<ReturnType<typeof agentOnPhone>>;
  let a2: Awaited<ReturnType<typeof agentOnPhone>>;
  let supX: Awaited<ReturnType<typeof consoleSession>>;
  const today = () => {
    const d = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    return d;
  };

  beforeAll(async () => {
    db = testDb();
    await seedTestDb(db);
    sms = new MemorySmsSender();
    app = buildApp({ db, sms });
    moto = (await db.vehicleClass.findUniqueOrThrow({ where: { code: 'MOTORIZADA' } })).id;
    areaX = await createArea(db);
    a1 = await agentOnPhone(app, db, areaX.name, moto);
    a2 = await agentOnPhone(app, db, areaX.name, moto);
    supX = await consoleSession(app, db, sms, 'supervisor', areaX.name);

    // Area X today: a1 issues 3 and is paid for 1; a2 issues 1 and is paid for it.
    const t1 = await a1.issue('X-1-TL');
    await a1.issue('X-2-TL');
    await a1.issue('X-3-TL');
    const t4 = await a2.issue('X-4-TL');
    expect((await a1.pay(t1.id)).statusCode).toBe(200);
    expect((await a2.pay(t4.id)).statusCode).toBe(200);
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  const get = (url: string, headers: Record<string, string>) =>
    app.inject({ method: 'GET', url, headers });

  describe('GET /reference', () => {
    it('a supervisor sees only their areas and the agents in them', async () => {
      const ref = referenceResponseSchema.parse((await get('/reference', supX.headers)).json());
      expect(ref.areas.map((a) => a.id)).toEqual([areaX.id]);
      expect(ref.agents.map((a) => a.id).sort()).toEqual([a1.agent.id, a2.agent.id].sort());
      expect(ref.vehicleClasses.length).toBeGreaterThanOrEqual(4);
    });

    it('finance sees every area', async () => {
      const finance = await consoleSession(app, db, sms, 'finance');
      const ref = referenceResponseSchema.parse((await get('/reference', finance.headers)).json());
      expect(ref.areas.map((a) => a.name)).toEqual(
        expect.arrayContaining(['Setor A', 'Setor B', 'Setor C', areaX.name]),
      );
    });

    it('agents cannot use console views', async () => {
      expect((await get('/reference', a1.headers)).statusCode).toBe(403);
    });
  });

  describe('GET /monitor (FR-20)', () => {
    it('totals for the supervisor’s area today', async () => {
      const m = monitorResponseSchema.parse((await get('/monitor', supX.headers)).json());
      expect(m).toMatchObject({
        date: today(),
        parked: { count: 2, byClass: [{ vehicleClassId: moto, count: 2 }] },
        received: { amountCents: 100, payments: 2 },
        issued: { count: 4, active: 2, paid: 2 },
        exits: 2,
      });
    });

    it('filters by agent (FR-21)', async () => {
      const m = monitorResponseSchema.parse(
        (await get(`/monitor?agentId=${a1.agent.id}`, supX.headers)).json(),
      );
      expect(m).toMatchObject({
        parked: { count: 2 },
        received: { amountCents: 50, payments: 1 },
        issued: { count: 3, active: 2, paid: 1 },
        exits: 1,
      });
    });

    it('another day has no activity', async () => {
      const m = monitorResponseSchema.parse(
        (await get('/monitor?date=2020-01-01', supX.headers)).json(),
      );
      expect(m).toMatchObject({ received: { amountCents: 0 }, issued: { count: 0 }, exits: 0 });
      expect(m.parked.count).toBe(2); // parked now, whatever the day
    });

    it('a supervisor of another area may not look at area X', async () => {
      const other = await consoleSession(app, db, sms, 'supervisor', 'Setor B');
      expect((await get(`/monitor?areaId=${areaX.id}`, other.headers)).statusCode).toBe(403);
      const own = monitorResponseSchema.parse((await get('/monitor', other.headers)).json());
      expect(own.issued.count).not.toBe(4); // area X tickets are not counted
    });
  });

  describe('GET /events (FR-26)', () => {
    it('the supervisor sees the ticket events and sign-ins of their area, newest first', async () => {
      const res = listEventsResponseSchema.parse(
        (await get('/events?limit=200', supX.headers)).json(),
      );
      const types = res.items.map((e) => e.type);
      expect(types.filter((t) => t === 'ISSUE')).toHaveLength(4);
      expect(types.filter((t) => t === 'PAYMENT')).toHaveLength(2);
      expect(types).toContain('SIGN_IN');
      const times = res.items.map((e) => Date.parse(e.at));
      expect([...times].sort((x, y) => y - x)).toEqual(times);
      const payment = res.items.find((e) => e.type === 'PAYMENT')!;
      expect(payment.ref).toMatch(/^EVT-\d{7}-03$/);
      expect(payment.ticket?.plate).toMatch(/^X-[14]-TL$/);
      expect(payment.user.agentNumber).toMatch(/^T-/);
    });

    it('filters by type, plate and agent', async () => {
      const byType = listEventsResponseSchema.parse(
        (await get('/events?type=EXIT', supX.headers)).json(),
      );
      expect(byType.total).toBe(2);
      const byPlate = listEventsResponseSchema.parse(
        (await get('/events?q=x-2-tl', supX.headers)).json(),
      );
      expect(byPlate.items.map((e) => e.type)).toEqual(['ISSUE']);
      const byAgent = listEventsResponseSchema.parse(
        (await get(`/events?agentId=${a2.agent.id}&type=ISSUE`, supX.headers)).json(),
      );
      expect(byAgent.total).toBe(1);
    });

    it('auditors see everything; finance may not read the log', async () => {
      const auditor = await consoleSession(app, db, sms, 'auditor');
      const all = listEventsResponseSchema.parse((await get('/events', auditor.headers)).json());
      const mine = listEventsResponseSchema.parse((await get('/events', supX.headers)).json());
      expect(all.total).toBeGreaterThan(mine.total);
      const finance = await consoleSession(app, db, sms, 'finance');
      expect((await get('/events', finance.headers)).statusCode).toBe(403);
    });
  });

  describe('GET /reports/daily (FR-25)', () => {
    it('revenue per agent and per area for the day', async () => {
      const finance = await consoleSession(app, db, sms, 'finance');
      const report = dailyReportResponseSchema.parse(
        (await get(`/reports/daily?areaId=${areaX.id}`, finance.headers)).json(),
      );
      expect(report.total).toEqual({ payments: 2, amountCents: 100, issued: 4, stillParked: 2 });
      expect(report.byArea).toEqual([
        { areaId: areaX.id, name: areaX.name, payments: 2, amountCents: 100 },
      ]);
      expect(report.byAgent.map((a) => [a.agentId, a.amountCents]).sort()).toEqual(
        [
          [a1.agent.id, 50],
          [a2.agent.id, 50],
        ].sort(),
      );
    });

    it('auditors may read it, admins and agents may not', async () => {
      const admin = await consoleSession(app, db, sms, 'admin');
      expect((await get('/reports/daily', admin.headers)).statusCode).toBe(403);
      expect((await get('/reports/daily', a1.headers)).statusCode).toBe(403);
    });
  });
});
