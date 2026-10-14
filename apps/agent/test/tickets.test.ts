// Issuing and closing tickets on the phone with no network (NFR-01).
import { beforeEach, describe, expect, it } from 'vitest';
import { pullResponseSchema, ticketIssuedItemSchema } from '@estacionamento/shared';
import type { SqlDb } from '../src/db/types';
import { countQueued, queuedFor } from '../src/local/outbox';
import { replaceReference } from '../src/local/reference';
import { mergeSerialBlocks, remainingSerials } from '../src/local/serials';
import {
  LocalError,
  closeTicket,
  getReceipt,
  getTicket,
  lastEventRefOf,
  issueRefOf,
  issueTicket,
  myTicketsForDay,
  parkedInMyAreas,
  quoteExit,
  todaySummary,
} from '../src/local/tickets';
import { AREA_B, CAR, MOTO, agentUser, fakeApi, makeEnv, pullResponse, session } from './helpers';

const MINUTE = 60_000;

async function readyEnv() {
  const { api } = fakeApi(() => 'offline');
  const env = await makeEnv(api);
  await env.db.transaction(async (tx: SqlDb) => {
    await replaceReference(tx, pullResponseSchema.parse(pullResponse()));
    await mergeSerialBlocks(tx, [
      { start: 2538668, end: 2538670 },
      { start: 2538671, end: 2538672 },
    ]);
  });
  return env;
}

describe('issue offline', () => {
  let env: Awaited<ReturnType<typeof readyEnv>>;
  beforeEach(async () => {
    env = await readyEnv();
  });

  it('takes the next serial, uses the system clock and tariff, and queues one outbox item', async () => {
    const t = await issueTicket(env, session(), { plate: ' a-2847-tl ', vehicleClassId: MOTO });
    expect(t).toMatchObject({
      serial: '2538668/MAE/A.M.DILI',
      plate: 'A-2847-TL',
      status: 'ATIVO',
      entryAt: '2026-10-13T00:20:00.000Z',
      tariffCentsPerHour: 50,
      agentId: agentUser.id,
      syncState: 'local',
    });
    expect(issueRefOf(t.serial)).toBe('EVT-2538668-01');

    const [row] = await queuedFor(env.db, agentUser.id, 10);
    const item = ticketIssuedItemSchema.parse(row!.item);
    expect(item.ticket).toMatchObject({ id: t.id, serial: t.serial, entryAt: t.entryAt });
  });

  it('moves to the spare block, then refuses when every serial is used', async () => {
    const serials = [];
    for (let i = 0; i < 5; i++)
      serials.push(
        (await issueTicket(env, session(), { plate: `P${i}`, vehicleClassId: MOTO })).serial,
      );
    expect(serials.map((s) => s.slice(0, 7))).toEqual([
      '2538668',
      '2538669',
      '2538670',
      '2538671',
      '2538672',
    ]);
    expect(await remainingSerials(env.db)).toBe(0);

    const err = await issueTicket(env, session(), { plate: 'X', vehicleClassId: MOTO }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(LocalError);
    expect(err.code).toBe('NO_SERIALS');
    expect(await countQueued(env.db)).toBe(5); // nothing half-written
  });

  it('refuses an inactive class (tariff not decided) and an area that is not the agent’s', async () => {
    await expect(
      issueTicket(env, session(), { plate: 'X', vehicleClassId: CAR }),
    ).rejects.toMatchObject({ code: 'VEHICLE_CLASS_INACTIVE' });
    await expect(
      issueTicket(env, session(), { plate: 'X', vehicleClassId: MOTO, areaId: AREA_B }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await remainingSerials(env.db)).toBe(5); // no serial was used up
  });
});

describe('exit and payment offline', () => {
  it('1 h 45 min → 2 h × 50 c; receipt; ticket closed; close queued after the issue', async () => {
    const env = await readyEnv();
    const t = await issueTicket(env, session(), { plate: 'A-1', vehicleClassId: MOTO });
    env.advance(105 * MINUTE);

    const quote = await quoteExit(env, session(), t.id);
    expect(quote).toMatchObject({ durationMinutes: 105, hoursCharged: 2, amountCents: 100 });

    const receipt = await closeTicket(env, session(), t.id, {
      expectedAmountCents: 100,
      receivedCents: 500,
    });
    expect(receipt).toMatchObject({
      receiptNo: 'REC-2538668',
      paymentRef: 'EVT-2538668-03',
      amountCents: 100,
      changeCents: 400,
      agent: { agentNumber: 'AMD-017' },
    });

    const kinds = (await queuedFor(env.db, agentUser.id, 10)).map((r) => r.kind);
    expect(kinds).toEqual(['TICKET_ISSUED', 'TICKET_CLOSED']);

    // The receipt screen rebuilds the same receipt from the phone's records.
    expect(await getReceipt(env.db, session(), t.id)).toEqual(receipt);
    expect(lastEventRefOf((await getTicket(env.db, t.id))!)).toBe('EVT-2538668-03');

    await expect(
      closeTicket(env, session(), t.id, { expectedAmountCents: 100, receivedCents: 100 }),
    ).rejects.toMatchObject({
      code: 'ALREADY_PAID',
    });
  });

  it('CHARGE_CHANGED with the new quote when an hour starts after the quote', async () => {
    const env = await readyEnv();
    const t = await issueTicket(env, session(), { plate: 'A-1', vehicleClassId: MOTO });
    env.advance(59 * MINUTE);
    const quote = await quoteExit(env, session(), t.id);
    env.advance(2 * MINUTE);
    const err = await closeTicket(env, session(), t.id, {
      expectedAmountCents: quote.amountCents,
      receivedCents: 100,
    }).catch((e) => e);
    expect(err.code).toBe('CHARGE_CHANGED');
    expect(err.quote).toMatchObject({ hoursCharged: 2, amountCents: 100 });
  });

  it('refuses cash below the amount due', async () => {
    const env = await readyEnv();
    const t = await issueTicket(env, session(), { plate: 'A-1', vehicleClassId: MOTO });
    await expect(
      closeTicket(env, session(), t.id, { expectedAmountCents: 50, receivedCents: 49 }),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_PAYMENT',
    });
  });

  it('a paid ticket cannot be reopened, even by SQL (BR-05)', async () => {
    const env = await readyEnv();
    const t = await issueTicket(env, session(), { plate: 'A-1', vehicleClassId: MOTO });
    await closeTicket(env, session(), t.id, { expectedAmountCents: 50, receivedCents: 50 });
    await expect(
      env.db.run("UPDATE tickets SET status = 'ATIVO' WHERE id = ?", t.id),
    ).rejects.toThrow(/reopened/);
  });
});

describe('lists (FR-13, FR-18, FR-19)', () => {
  it('parked list, my day with filters and search, and today’s totals', async () => {
    const env = await readyEnv();
    const a = await issueTicket(env, session(), { plate: 'A-2847-TL', vehicleClassId: MOTO });
    env.advance(MINUTE);
    const b = await issueTicket(env, session(), { plate: 'B-1042-TL', vehicleClassId: MOTO });
    env.advance(61 * MINUTE);
    await closeTicket(env, session(), a.id, { expectedAmountCents: 100, receivedCents: 100 });

    expect((await parkedInMyAreas(env.db, session())).map((t) => t.id)).toEqual([b.id]);
    expect((await myTicketsForDay(env.db, session(), env.now())).map((t) => t.id)).toEqual([
      b.id,
      a.id,
    ]);
    expect(
      (await myTicketsForDay(env.db, session(), env.now(), { status: 'PAGO' })).map((t) => t.id),
    ).toEqual([a.id]);
    expect(
      (await myTicketsForDay(env.db, session(), env.now(), { q: '1042' })).map((t) => t.id),
    ).toEqual([b.id]);
    expect(
      (await myTicketsForDay(env.db, session(), env.now(), { q: '2538668' })).map((t) => t.id),
    ).toEqual([a.id]);
    expect(await todaySummary(env.db, session(), env.now())).toEqual({
      parkedCount: 1,
      receivedTodayCents: 100,
    });
  });
});
