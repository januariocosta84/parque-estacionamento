// M4 sync API (docs/SYNC.md): serial blocks, idempotent push in any order, pull, blocked phones.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  formatSerial,
  pullResponseSchema,
  pushResponseSchema,
  serialBlocksResponseSchema,
  sessionResponseSchema,
} from '@estacionamento/shared';
import type { PushItem } from '@estacionamento/shared';
import { buildApp } from '../src/app';
import type { Db } from '../src/db';
import { MemorySmsSender } from '../src/sms';
import {
  createAgent,
  createConsoleUser,
  hasTestDb,
  newDeviceId,
  seedTestDb,
  testDb,
  unique,
} from './helpers';

const MINUTE = 60_000;

describe.skipIf(!hasTestDb)('sync API (M4)', () => {
  let db: Db;
  let sms: MemorySmsSender;
  let app: ReturnType<typeof buildApp>;
  let classId: string;
  let setorA: string;

  beforeAll(async () => {
    db = testDb();
    await seedTestDb(db);
    sms = new MemorySmsSender();
    app = buildApp({ db, sms });
    classId = (await db.vehicleClass.findUniqueOrThrow({ where: { code: 'MOTORIZADA' } })).id;
    setorA = (await db.area.findUniqueOrThrow({ where: { name: 'Setor A' } })).id;
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  /** An agent signed in on a phone that has fetched its serial blocks. */
  async function phone(areaName = 'Setor A') {
    const agent = await createAgent(db, { areaName });
    const deviceId = newDeviceId();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/agent/login',
      payload: { agentNumber: agent.agentNumber, pin: '123456', deviceId },
    });
    const { token } = sessionResponseSchema.parse(login.json());
    const res = await app.inject({
      method: 'POST',
      url: '/sync/serial-blocks',
      headers: bearer(token),
    });
    const { blocks } = serialBlocksResponseSchema.parse(res.json());
    let next = blocks[0]!.start;
    const areaId = (await db.area.findUniqueOrThrow({ where: { name: areaName } })).id;
    return { agent, deviceId, token, blocks, areaId, nextSerial: () => formatSerial(next++) };
  }
  type Phone = Awaited<ReturnType<typeof phone>>;

  function issued(
    p: Phone,
    overrides: Partial<Extract<PushItem, { kind: 'TICKET_ISSUED' }>['ticket']> = {},
  ) {
    return {
      kind: 'TICKET_ISSUED',
      ticket: {
        id: randomUUID(),
        serial: p.nextSerial(),
        plate: 'A-2847-TL',
        vehicleClassId: classId,
        areaId: p.areaId,
        entryAt: new Date(Date.now() - 105 * MINUTE).toISOString(),
        tariffCentsPerHour: 50,
        ...overrides,
      },
      issueEventId: randomUUID(),
    } satisfies PushItem;
  }

  function closed(ticketId: string, overrides: Record<string, unknown> = {}) {
    return {
      kind: 'TICKET_CLOSED',
      ticketId,
      exitAt: new Date().toISOString(),
      hoursCharged: 2,
      amountCents: 100,
      payment: { id: randomUUID(), method: 'CASH', receivedCents: 100 },
      exitEventId: randomUUID(),
      paymentEventId: randomUUID(),
      ...overrides,
    } as PushItem;
  }

  async function push(p: Phone, items: PushItem[], deviceTime = new Date()) {
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: bearer(p.token),
      payload: { deviceTime: deviceTime.toISOString(), items },
    });
    return { statusCode: res.statusCode, body: res.json() };
  }

  async function pushOk(p: Phone, items: PushItem[], deviceTime?: Date) {
    const { statusCode, body } = await push(p, items, deviceTime);
    expect(statusCode).toBe(200);
    return pushResponseSchema
      .parse(body)
      .results.map((r) => (r.status === 'rejected' ? `rejected:${r.error}` : r.status));
  }

  describe('serial blocks (FR-08)', () => {
    it('gives a phone two blocks of 50 and is idempotent', async () => {
      const p = await phone();
      expect(p.blocks).toHaveLength(2);
      for (const b of p.blocks) expect(b.end - b.start + 1).toBe(50);
      expect(p.blocks[1]!.start).toBeGreaterThan(p.blocks[0]!.end);

      const again = serialBlocksResponseSchema.parse(
        (
          await app.inject({ method: 'POST', url: '/sync/serial-blocks', headers: bearer(p.token) })
        ).json(),
      );
      expect(again.blocks).toEqual(p.blocks);
    });

    it('tops up with a new block once one is used up', async () => {
      const p = await phone();
      const items = Array.from({ length: 50 }, () => issued(p));
      expect(new Set(await pushOk(p, items))).toEqual(new Set(['applied']));

      const after = serialBlocksResponseSchema.parse(
        (
          await app.inject({ method: 'POST', url: '/sync/serial-blocks', headers: bearer(p.token) })
        ).json(),
      );
      expect(after.blocks[0]).toEqual(p.blocks[1]);
      expect(after.blocks[1]!.start).toBeGreaterThan(p.blocks[1]!.end);
    });

    it('phones asking at the same time never get overlapping blocks', async () => {
      const phones = await Promise.all([phone(), phone(), phone(), phone()]);
      const all = phones.flatMap((p) => p.blocks).sort((a, b) => a.start - b.start);
      for (let i = 1; i < all.length; i++) expect(all[i]!.start).toBeGreaterThan(all[i - 1]!.end);
    });
  });

  describe('push (NFR-01): idempotent, any order', () => {
    it('applies an offline issue with the phone’s times and client ids', async () => {
      const p = await phone();
      const item = issued(p);
      expect(await pushOk(p, [item])).toEqual(['applied']);

      const ticket = await db.ticket.findUniqueOrThrow({ where: { id: item.ticket.id } });
      expect(ticket.entryAt.toISOString()).toBe(item.ticket.entryAt);
      expect(ticket).toMatchObject({ agentId: p.agent.id, deviceId: p.deviceId, status: 'ATIVO' });
      const event = await db.event.findUniqueOrThrow({ where: { id: item.issueEventId } });
      expect(event).toMatchObject({
        type: 'ISSUE',
        ref: `EVT-${item.ticket.serial.slice(0, 7)}-01`,
        details: { offline: true },
      });
      expect(event.at.toISOString()).toBe(item.ticket.entryAt);
    });

    it('a repeated push is a duplicate and changes nothing', async () => {
      const p = await phone();
      const issue = issued(p);
      const close = closed(issue.ticket.id);
      expect(await pushOk(p, [issue, close])).toEqual(['applied', 'applied']);
      expect(await pushOk(p, [issue, close])).toEqual(['duplicate', 'duplicate']);
      expect(await db.event.count({ where: { ticketId: issue.ticket.id } })).toBe(3);
      expect(await db.payment.count({ where: { ticketId: issue.ticket.id } })).toBe(1);
    });

    it('a close sent before its issue is pending, then applies', async () => {
      const p = await phone();
      const issue = issued(p);
      const close = closed(issue.ticket.id);
      expect(await pushOk(p, [close])).toEqual(['pending']);
      expect(await pushOk(p, [close, issue])).toEqual(['applied', 'applied']);
      const t = await db.ticket.findUniqueOrThrow({ where: { id: issue.ticket.id } });
      expect(t.status).toBe('PAGO');
      const refs = (
        await db.event.findMany({ where: { ticketId: t.id }, orderBy: { ref: 'asc' } })
      ).map((e) => e.ref);
      const n = t.serial.slice(0, 7);
      expect(refs).toEqual([`EVT-${n}-01`, `EVT-${n}-02`, `EVT-${n}-03`]);
    });

    it('rejects a serial from another phone and a reused id with different content', async () => {
      const a = await phone();
      const b = await phone();
      const stolen = issued(a, { serial: formatSerial(b.blocks[0]!.start) });
      expect(await pushOk(a, [stolen])).toEqual(['rejected:SERIAL_NOT_ALLOCATED']);

      const item = issued(a);
      await pushOk(a, [item]);
      const changed = { ...item, ticket: { ...item.ticket, plate: 'Z-9999-TL' } };
      expect(await pushOk(a, [changed])).toEqual(['rejected:CONFLICT']);
    });

    it('one bad item does not block the others', async () => {
      const p = await phone();
      const good1 = issued(p);
      const bad = issued(p, { areaId: randomUUID() });
      const good2 = issued(p);
      expect(await pushOk(p, [good1, bad, good2])).toEqual([
        'applied',
        'rejected:FORBIDDEN',
        'applied',
      ]);
    });

    it('keeps what the phone charged but flags a charge that differs from charging.ts', async () => {
      const p = await phone();
      const issue = issued(p); // 1 h 45 min ago → server says 2 h = 100 c
      const close = closed(issue.ticket.id, {
        hoursCharged: 1,
        amountCents: 50,
        payment: { id: randomUUID(), method: 'CASH', receivedCents: 50 },
      });
      expect(await pushOk(p, [issue, close])).toEqual(['applied', 'applied']);
      const t = await db.ticket.findUniqueOrThrow({ where: { id: issue.ticket.id } });
      expect(t.amountCents).toBe(50);
      const exitEvent = await db.event.findFirstOrThrow({
        where: { ticketId: t.id, type: 'EXIT' },
      });
      expect(exitEvent.details).toMatchObject({
        chargeMismatch: { expectedHours: 2, expectedAmountCents: 100 },
      });
    });

    it('a second payment for a paid ticket is rejected and logged once for review', async () => {
      const issuer = await phone();
      const other = await phone();
      const issue = issued(issuer);
      await pushOk(issuer, [issue]);
      expect(await pushOk(issuer, [closed(issue.ticket.id)])).toEqual(['applied']);

      const late = closed(issue.ticket.id);
      expect(await pushOk(other, [late])).toEqual(['rejected:ALREADY_PAID']);
      expect(await pushOk(other, [late])).toEqual(['rejected:ALREADY_PAID']);
      const corrections = await db.event.findMany({
        where: { ticketId: issue.ticket.id, type: 'CORRECTION' },
      });
      expect(corrections).toHaveLength(1);
      expect(corrections[0]!.ref).toMatch(/-04$/);
      expect(corrections[0]!.details).toMatchObject({ needsReview: true, phoneAmountCents: 100 });
    });

    it('flags clock skew over 5 minutes and records offline sign-ins', async () => {
      const p = await phone();
      const signIn = {
        kind: 'SIGN_IN',
        eventId: randomUUID(),
        at: new Date().toISOString(),
        success: false,
        reason: 'wrong_pin',
      } as PushItem;
      const fast = new Date(Date.now() + 10 * MINUTE);
      const { body } = await push(p, [signIn], fast);
      const res = pushResponseSchema.parse(body);
      expect(res.results).toEqual([{ status: 'applied' }]);
      expect(res.clockSkewSeconds).toBeGreaterThan(590);

      const event = await db.event.findUniqueOrThrow({
        where: { id: (signIn as { eventId: string }).eventId },
      });
      expect(event).toMatchObject({ type: 'SIGN_IN', userId: p.agent.id, deviceId: p.deviceId });
      expect(event.ref).toMatch(/^SYS-/);
      expect(event.details).toMatchObject({ success: false, offline: true, reason: 'wrong_pin' });
      expect((event.details as { clockSkewSeconds: number }).clockSkewSeconds).toBeGreaterThan(590);
      expect(await pushOk(p, [signIn])).toEqual(['duplicate']);
    });
  });

  describe('pull', () => {
    it('sends reference data and the agent’s parked list; later pulls send only changes', async () => {
      const me = await phone();
      const colleague = await phone();
      const plate = `P-${unique().slice(-5)}-TL`;
      const theirs = issued(colleague, { plate });
      await pushOk(colleague, [theirs]);

      const first = pullResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/sync/pull', headers: bearer(me.token) })).json(),
      );
      expect(first.settings.chargingRule).toEqual({ minimumHours: 1, graceMinutes: 0 });
      expect(first.areas.map((a) => a.id)).toEqual([setorA]);
      expect(first.tariffs.some((t) => t.vehicleClassId === classId && t.centsPerHour === 50)).toBe(
        true,
      );
      expect(first.vehicleClasses.find((c) => c.code === 'LIGEIRO')?.active).toBe(false);
      expect(first.tickets.map((t) => t.id)).toContain(theirs.ticket.id);

      // Colleague's ticket is paid; my next pull says to drop it, without revealing the amount.
      await pushOk(colleague, [closed(theirs.ticket.id)]);
      const next = pullResponseSchema.parse(
        (
          await app.inject({
            method: 'GET',
            url: `/sync/pull?since=${encodeURIComponent(first.cursor)}`,
            headers: bearer(me.token),
          })
        ).json(),
      );
      expect(next.closedTicketIds).toContain(theirs.ticket.id);
      expect(next.tickets.map((t) => t.id)).not.toContain(theirs.ticket.id);
    });

    it('does not send tickets from other areas', async () => {
      const me = await phone('Setor A');
      const elsewhere = await phone('Setor C');
      const item = issued(elsewhere);
      await pushOk(elsewhere, [item]);
      const res = pullResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/sync/pull', headers: bearer(me.token) })).json(),
      );
      expect(res.tickets.map((t) => t.id)).not.toContain(item.ticket.id);
    });
  });

  describe('blocked phone (FR-05)', () => {
    it('a supervisor blocks the phone; its next sync is refused and the block is logged', async () => {
      const p = await phone('Setor B');
      const supervisor = await createConsoleUser(db, 'supervisor', { areaName: 'Setor B' });
      const step1 = await app.inject({
        method: 'POST',
        url: '/auth/console/login',
        payload: { username: supervisor.username, password: 'console-password' },
      });
      const code = sms.sent.at(-1)!.text.match(/\b(\d{6})\b/)![1];
      const { token } = sessionResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/auth/console/verify',
            payload: { challengeId: step1.json().challengeId, code },
          })
        ).json(),
      );

      const block = await app.inject({
        method: 'POST',
        url: `/devices/${p.deviceId}/block`,
        headers: bearer(token),
        payload: { reason: 'Phone reported stolen' },
      });
      expect(block.statusCode).toBe(204);

      const { statusCode } = await push(p, [issued(p)]);
      expect(statusCode).toBe(401); // session revoked with the block
      const login = await app.inject({
        method: 'POST',
        url: '/auth/agent/login',
        payload: { agentNumber: p.agent.agentNumber, pin: '123456', deviceId: p.deviceId },
      });
      expect(login.json().error).toBe('DEVICE_BLOCKED');

      const event = await db.event.findFirstOrThrow({
        where: { userId: supervisor.id, type: 'ADMIN_CHANGE' },
      });
      expect(event.details).toMatchObject({
        action: 'block_device',
        deviceId: p.deviceId,
        reason: 'Phone reported stolen',
      });
    });

    it('agents and console users without a phone cannot sync', async () => {
      const finance = await createConsoleUser(db, 'finance');
      expect(finance).toBeTruthy();
      const res = await app.inject({ method: 'POST', url: '/sync/serial-blocks' });
      expect(res.statusCode).toBe(401);
    });
  });
});
