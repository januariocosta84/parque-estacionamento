// M3 ticket API: issue → quote → exit + payment → receipt, search, scoping, and events.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  chargeQuoteSchema,
  errorResponseSchema,
  formatSerial,
  listTicketsResponseSchema,
  receiptSchema,
  sessionResponseSchema,
  ticketViewSchema,
  todaySummarySchema,
} from '@estacionamento/shared';
import { buildApp } from '../src/app';
import type { Db } from '../src/db';
import { MemorySmsSender } from '../src/sms';
import {
  allocateTestBlock,
  createAgent,
  createConsoleUser,
  hasTestDb,
  newDeviceId,
  seedTestDb,
  testDb,
  unique,
} from './helpers';

const MINUTE = 60_000;

describe.skipIf(!hasTestDb)('ticket API (M3)', () => {
  let db: Db;
  let sms: MemorySmsSender;
  let app: ReturnType<typeof buildApp>;
  /** A vehicle class owned by this file, at 50 c/h, so tariff changes here affect nothing else. */
  let classId: string;
  let inactiveClassId: string;

  beforeAll(async () => {
    db = testDb();
    await seedTestDb(db);
    sms = new MemorySmsSender();
    app = buildApp({ db, sms });
    const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
    const vc = await db.vehicleClass.create({
      data: { code: `T-${unique()}`, namePt: 'Teste', nameTet: 'Teste', active: true },
    });
    classId = vc.id;
    await db.tariff.create({
      data: {
        vehicleClassId: classId,
        centsPerHour: 50,
        validFrom: new Date('2020-01-01T00:00:00Z'),
        changedById: admin.id,
      },
    });
    inactiveClassId = (await db.vehicleClass.findUniqueOrThrow({ where: { code: 'LIGEIRO' } })).id;
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  /** Agent signed in on a phone that holds a serial block. */
  async function agentOnPhone(areaName = 'Setor A') {
    const agent = await createAgent(db, { areaName });
    const deviceId = newDeviceId();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/agent/login',
      payload: { agentNumber: agent.agentNumber, pin: '123456', deviceId },
    });
    const { token } = sessionResponseSchema.parse(res.json());
    const block = await allocateTestBlock(db, deviceId);
    let next = block.start;
    return { agent, deviceId, token, block, nextSerial: () => formatSerial(next++) };
  }

  async function consoleToken(
    role: 'supervisor' | 'finance' | 'auditor' | 'admin',
    areaName = 'Setor A',
  ) {
    const user = await createConsoleUser(db, role, { areaName });
    const step1 = await app.inject({
      method: 'POST',
      url: '/auth/console/login',
      payload: { username: user.username, password: 'console-password' },
    });
    const code = sms.sent.at(-1)!.text.match(/\b(\d{6})\b/)![1];
    const step2 = await app.inject({
      method: 'POST',
      url: '/auth/console/verify',
      payload: { challengeId: step1.json().challengeId, code },
    });
    return { user, token: sessionResponseSchema.parse(step2.json()).token };
  }

  async function issue(
    phone: Awaited<ReturnType<typeof agentOnPhone>>,
    overrides: Record<string, unknown> = {},
  ) {
    return app.inject({
      method: 'POST',
      url: '/tickets',
      headers: bearer(phone.token),
      payload: {
        id: randomUUID(),
        serial: phone.nextSerial(),
        plate: 'a-2847-tl',
        vehicleClassId: classId,
        ...overrides,
      },
    });
  }

  function exit(
    token: string,
    ticketId: string,
    expectedAmountCents: number,
    receivedCents = expectedAmountCents,
    paymentId = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: `/tickets/${ticketId}/exit`,
      headers: bearer(token),
      payload: { paymentId, method: 'CASH', expectedAmountCents, receivedCents },
    });
  }

  /** Move the server clock forward without touching Fastify's timers. */
  function advanceClock(ms: number) {
    const now = Date.now();
    if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['Date'], now });
    vi.setSystemTime(new Date(now + ms));
  }

  describe('issue (FR-06, FR-07, FR-08, FR-10)', () => {
    it('creates an active ticket with server time, tariff, ISSUE event and three copies', async () => {
      const phone = await agentOnPhone();
      const before = Date.now();
      const res = await issue(phone, { entryAt: '2020-01-01T00:00:00Z', agentId: randomUUID() });
      expect(res.statusCode).toBe(201);

      const view = ticketViewSchema.parse(res.json());
      expect(view.ticket).toMatchObject({
        plate: 'A-2847-TL',
        status: 'ATIVO',
        agentId: phone.agent.id,
        deviceId: phone.deviceId,
        tariffCentsPerHour: 50,
        exitAt: null,
      });
      // BR-09: the entry time a client sends is ignored
      expect(Date.parse(view.ticket.entryAt)).toBeGreaterThanOrEqual(before - 1000);
      expect(view.copies).toEqual(['WHITE', 'YELLOW', 'RED']);
      expect(view.issueRef).toBe(`EVT-${view.ticket.serial.slice(0, 7)}-01`);

      const event = await db.event.findUniqueOrThrow({ where: { ref: view.issueRef } });
      expect(event).toMatchObject({
        type: 'ISSUE',
        ticketId: view.ticket.id,
        userId: phone.agent.id,
        deviceId: phone.deviceId,
      });
    });

    it('is idempotent: retrying with the same id returns the same ticket', async () => {
      const phone = await agentOnPhone();
      const id = randomUUID();
      const serial = phone.nextSerial();
      const first = await issue(phone, { id, serial });
      const again = await issue(phone, { id, serial });
      expect(first.statusCode).toBe(201);
      expect(again.statusCode).toBe(200);
      expect(again.json().ticket.id).toBe(id);
      expect(await db.event.count({ where: { ticketId: id } })).toBe(1);
    });

    it('rejects a serial outside this phone’s block, or one already used', async () => {
      const phone = await agentOnPhone();
      const outside = await issue(phone, { serial: formatSerial(phone.block.end + 1) });
      expect(outside.statusCode).toBe(422);
      expect(outside.json().error).toBe('SERIAL_NOT_ALLOCATED');

      const serial = phone.nextSerial();
      expect((await issue(phone, { serial })).statusCode).toBe(201);
      const dup = await issue(phone, { serial });
      expect(dup.statusCode).toBe(409);
      expect(dup.json().error).toBe('CONFLICT');
    });

    it('rejects an inactive vehicle class (tariff not decided), and an area that is not the agent’s', async () => {
      const phone = await agentOnPhone();
      const inactive = await issue(phone, { vehicleClassId: inactiveClassId });
      expect(inactive.json().error).toBe('VEHICLE_CLASS_INACTIVE');

      const setorB = await db.area.findUniqueOrThrow({ where: { name: 'Setor B' } });
      expect((await issue(phone, { areaId: setorB.id })).statusCode).toBe(403);
    });

    it('only agents on a phone issue tickets', async () => {
      const { token } = await consoleToken('supervisor');
      const res = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: bearer(token),
        payload: { id: randomUUID(), serial: formatSerial(1), plate: 'X', vehicleClassId: classId },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('exit and payment (FR-14–17)', () => {
    it('1 h 45 min → 2 h × 50 c = 100 c; receipt with change; ticket closed; EXIT and PAYMENT events', async () => {
      const phone = await agentOnPhone();
      const { ticket } = ticketViewSchema.parse((await issue(phone)).json());
      advanceClock(105 * MINUTE);

      const quote = chargeQuoteSchema.parse(
        (
          await app.inject({
            method: 'GET',
            url: `/tickets/${ticket.id}/charge`,
            headers: bearer(phone.token),
          })
        ).json(),
      );
      expect(quote).toMatchObject({
        durationMinutes: 105,
        hoursCharged: 2,
        tariffCentsPerHour: 50,
        amountCents: 100,
      });

      const res = await exit(phone.token, ticket.id, 100, 500);
      expect(res.statusCode).toBe(200);
      const receipt = receiptSchema.parse(res.json());
      const n = ticket.serial.slice(0, 7);
      expect(receipt).toMatchObject({
        receiptNo: `REC-${n}`,
        paymentRef: `EVT-${n}-03`,
        plate: 'A-2847-TL',
        hoursCharged: 2,
        amountCents: 100,
        receivedCents: 500,
        changeCents: 400,
        method: 'CASH',
        agent: { id: phone.agent.id },
      });

      const stored = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(stored).toMatchObject({ status: 'PAGO', hoursCharged: 2, amountCents: 100 });
      const refs = (
        await db.event.findMany({ where: { ticketId: ticket.id }, orderBy: { ref: 'asc' } })
      ).map((e) => [e.ref, e.type]);
      expect(refs).toEqual([
        [`EVT-${n}-01`, 'ISSUE'],
        [`EVT-${n}-02`, 'EXIT'],
        [`EVT-${n}-03`, 'PAYMENT'],
      ]);
    });

    it('a retried payment returns the same receipt; a second payment is refused (BR-06)', async () => {
      const phone = await agentOnPhone();
      const { ticket } = ticketViewSchema.parse((await issue(phone)).json());
      const paymentId = randomUUID();
      const first = await exit(phone.token, ticket.id, 50, 50, paymentId);
      const retry = await exit(phone.token, ticket.id, 50, 50, paymentId);
      expect(retry.statusCode).toBe(200);
      expect(retry.json()).toEqual(first.json());

      const second = await exit(phone.token, ticket.id, 50);
      expect(second.statusCode).toBe(409);
      expect(second.json().error).toBe('ALREADY_PAID');
      expect(await db.payment.count({ where: { ticketId: ticket.id } })).toBe(1);
    });

    it('CHARGE_CHANGED when a new hour started after the quote, with the new quote', async () => {
      const phone = await agentOnPhone();
      const { ticket } = ticketViewSchema.parse((await issue(phone)).json());
      advanceClock(59 * MINUTE); // quote says 1 h = 50 c
      advanceClock(2 * MINUTE); //  driver pays at 61 min = 2 h
      const res = await exit(phone.token, ticket.id, 50);
      expect(res.statusCode).toBe(409);
      const body = errorResponseSchema.parse(res.json());
      expect(body.error).toBe('CHARGE_CHANGED');
      expect(body.quote).toMatchObject({ hoursCharged: 2, amountCents: 100 });
      expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe(
        'ATIVO',
      );
    });

    it('INSUFFICIENT_PAYMENT when the cash does not cover the charge', async () => {
      const phone = await agentOnPhone();
      const { ticket } = ticketViewSchema.parse((await issue(phone)).json());
      const res = await exit(phone.token, ticket.id, 50, 49);
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('INSUFFICIENT_PAYMENT');
    });

    it('BR-04: a tariff change after issue does not change what the driver pays', async () => {
      const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
      const vc = await db.vehicleClass.create({
        data: { code: `T-${unique()}`, namePt: 'Teste', nameTet: 'Teste', active: true },
      });
      const old = await db.tariff.create({
        data: {
          vehicleClassId: vc.id,
          centsPerHour: 50,
          validFrom: new Date('2020-01-01T00:00:00Z'),
          changedById: admin.id,
        },
      });
      const phone = await agentOnPhone();
      const { ticket } = ticketViewSchema.parse(
        (await issue(phone, { vehicleClassId: vc.id })).json(),
      );

      const changeAt = new Date();
      await db.tariff.update({ where: { id: old.id }, data: { validUntil: changeAt } });
      await db.tariff.create({
        data: {
          vehicleClassId: vc.id,
          centsPerHour: 75,
          validFrom: changeAt,
          changedById: admin.id,
        },
      });

      advanceClock(105 * MINUTE);
      const receipt = receiptSchema.parse((await exit(phone.token, ticket.id, 100)).json());
      expect(receipt).toMatchObject({ tariffCentsPerHour: 50, amountCents: 100 });

      // A ticket issued after the change uses the new tariff.
      const later = ticketViewSchema.parse((await issue(phone, { vehicleClassId: vc.id })).json());
      expect(later.ticket.tariffCentsPerHour).toBe(75);
    });

    it('FR-23: a supervisor of the area records exit + payment from the console (no device)', async () => {
      const phone = await agentOnPhone('Setor C');
      const { ticket } = ticketViewSchema.parse((await issue(phone)).json());
      const { user, token } = await consoleToken('supervisor', 'Setor C');

      const res = await exit(token, ticket.id, 50);
      expect(res.statusCode).toBe(200);
      expect(receiptSchema.parse(res.json()).agent.id).toBe(user.id);
      const payment = await db.event.findFirstOrThrow({
        where: { ticketId: ticket.id, type: 'PAYMENT' },
      });
      expect(payment).toMatchObject({ userId: user.id, deviceId: null });
    });

    it('a supervisor of another area cannot record the exit', async () => {
      const phone = await agentOnPhone('Setor C');
      const { ticket } = ticketViewSchema.parse((await issue(phone)).json());
      const { token } = await consoleToken('supervisor', 'Setor A');
      expect((await exit(token, ticket.id, 50)).statusCode).toBe(404);
    });

    it('a ticket whose entry is in the future (phone clock fast) charges the minimum, not a crash', async () => {
      const phone = await agentOnPhone();
      // A ticket synced from a phone whose clock was 2 hours fast.
      const ticket = { id: randomUUID() };
      const push = await app.inject({
        method: 'POST',
        url: '/sync/push',
        headers: bearer(phone.token),
        payload: {
          deviceTime: new Date(Date.now() + 2 * 60 * MINUTE).toISOString(),
          items: [
            {
              kind: 'TICKET_ISSUED',
              ticket: {
                id: ticket.id,
                serial: phone.nextSerial(),
                plate: 'F-1-TL',
                vehicleClassId: classId,
                areaId: (await db.area.findUniqueOrThrow({ where: { name: 'Setor A' } })).id,
                entryAt: new Date(Date.now() + 2 * 60 * MINUTE).toISOString(),
                tariffCentsPerHour: 50,
              },
              issueEventId: randomUUID(),
            },
          ],
        },
      });
      expect(push.json().results).toEqual([{ status: 'applied' }]);
      const quote = await app.inject({
        method: 'GET',
        url: `/tickets/${ticket.id}/charge`,
        headers: bearer(phone.token),
      });
      expect(quote.statusCode).toBe(200);
      expect(chargeQuoteSchema.parse(quote.json())).toMatchObject({
        durationMinutes: 0,
        hoursCharged: 1,
        amountCents: 50,
      });
      const res = await exit(phone.token, ticket.id, 50);
      expect(res.statusCode).toBe(200);
      const receipt = receiptSchema.parse(res.json());
      expect(Date.parse(receipt.exitAt)).toBeGreaterThanOrEqual(Date.parse(receipt.entryAt));
    });
  });

  describe('find and list (FR-13, FR-18, FR-21, FR-23) with role scoping', () => {
    it('search by partial plate or serial, filter by status, oldest first', async () => {
      const phone = await agentOnPhone('Setor B');
      const plate = `B-${unique().slice(-5)}-TL`;
      const a = ticketViewSchema.parse((await issue(phone, { plate })).json()).ticket;
      advanceClock(MINUTE);
      const b = ticketViewSchema.parse((await issue(phone, { plate })).json()).ticket;
      await exit(phone.token, b.id, 50);

      const list = async (qs: string) =>
        listTicketsResponseSchema.parse(
          (
            await app.inject({ method: 'GET', url: `/tickets?${qs}`, headers: bearer(phone.token) })
          ).json(),
        );

      const byPlate = await list(`q=${plate.slice(2, 7).toLowerCase()}&order=oldest`);
      expect(byPlate.items.map((t) => t.id)).toEqual([a.id, b.id]);
      expect(byPlate.items[1]?.lastEventRef).toMatch(/-03$/);

      const bySerial = await list(`q=${a.serial.slice(0, 7)}`);
      expect(bySerial.items.map((t) => t.id)).toEqual([a.id]);

      const active = await list(`q=${plate}&status=ATIVO`);
      expect(active.items.map((t) => t.id)).toEqual([a.id]);
    });

    it('agents see active tickets in their area, but not another agent’s paid tickets', async () => {
      const issuer = await agentOnPhone('Setor A');
      const colleague = await agentOnPhone('Setor A');
      const outsider = await agentOnPhone('Setor C');
      const plate = `S-${unique().slice(-5)}-TL`;
      const { ticket } = ticketViewSchema.parse((await issue(issuer, { plate })).json());

      const sees = async (token: string) =>
        listTicketsResponseSchema.parse(
          (
            await app.inject({ method: 'GET', url: `/tickets?q=${plate}`, headers: bearer(token) })
          ).json(),
        ).total;

      expect(await sees(colleague.token)).toBe(1);
      expect(await sees(outsider.token)).toBe(0);

      await exit(colleague.token, ticket.id, 50); // colleague can close it (same area)
      expect(await sees(colleague.token)).toBe(0); // paid, not theirs
      expect(await sees(issuer.token)).toBe(1); // own ticket
      const { token: finance } = await consoleToken('finance', 'Setor C');
      expect(await sees(finance)).toBe(1); // finance sees all areas

      const { token: admin } = await consoleToken('admin');
      const res = await app.inject({ method: 'GET', url: '/tickets', headers: bearer(admin) });
      expect(res.statusCode).toBe(403);
    });

    it('filters by Dili calendar day', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2030-03-01T14:59:00Z')); // 23:59 on 1 Mar in Dili
      const phone = await agentOnPhone();
      const plate = `D-${unique().slice(-5)}-TL`;
      await issue(phone, { plate });
      vi.setSystemTime(new Date('2030-03-01T15:01:00Z')); // 00:01 on 2 Mar in Dili
      await issue(phone, { plate });

      const day = async (date: string) =>
        listTicketsResponseSchema.parse(
          (
            await app.inject({
              method: 'GET',
              url: `/tickets?q=${plate}&date=${date}`,
              headers: bearer(phone.token),
            })
          ).json(),
        ).total;
      expect(await day('2030-03-01')).toBe(1);
      expect(await day('2030-03-02')).toBe(1);
    });

    it('rejects a bad query', async () => {
      const phone = await agentOnPhone();
      const res = await app.inject({
        method: 'GET',
        url: '/tickets?limit=1000',
        headers: bearer(phone.token),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('agent’s own day (FR-19)', () => {
    it('counts parked vehicles and sums cash received today', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2031-05-05T03:00:00Z')); // midday in Dili
      const phone = await agentOnPhone();
      const t1 = ticketViewSchema.parse((await issue(phone)).json()).ticket;
      await issue(phone);
      await issue(phone);
      advanceClock(61 * MINUTE);
      await exit(phone.token, t1.id, 100, 200);

      const today = todaySummarySchema.parse(
        (
          await app.inject({ method: 'GET', url: '/me/today', headers: bearer(phone.token) })
        ).json(),
      );
      expect(today.parkedCount).toBe(2);
      expect(today.receivedTodayCents).toBe(100); // the charge, not the cash handed over
    });
  });
});
