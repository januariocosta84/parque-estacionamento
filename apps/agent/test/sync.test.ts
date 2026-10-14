// Sync engine against a scripted API (docs/SYNC.md): push, pull merge, blocks, failures.
import { describe, expect, it } from 'vitest';
import { pullResponseSchema } from '@estacionamento/shared';
import type { PushItem, PushResult, Ticket } from '@estacionamento/shared';
import { countQueued, queuedFor, rejectedFor } from '../src/local/outbox';
import { getSettings, replaceReference } from '../src/local/reference';
import { mergeSerialBlocks, remainingSerials } from '../src/local/serials';
import { closeTicket, getTicket, issueTicket, parkedInMyAreas } from '../src/local/tickets';
import { SyncRunner, syncOnce } from '../src/sync';
import { AREA_A, MOTO, agentUser, fakeApi, makeEnv, pullResponse, session } from './helpers';
import type { FakeHandler } from './helpers';

const MINUTE = 60_000;
const BLOCKS = [
  { start: 2538668, end: 2538717 },
  { start: 2538718, end: 2538767 },
];

function colleagueTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    serial: '2600000/MAE/A.M.DILI',
    plate: 'C-1-TL',
    vehicleClassId: MOTO,
    areaId: AREA_A,
    agentId: '00000000-0000-4000-8000-000000000099',
    deviceId: '00000000-0000-4000-8000-0000000000d9',
    entryAt: '2026-10-13T00:00:00.000Z',
    exitAt: null,
    hoursCharged: null,
    tariffCentsPerHour: 50,
    amountCents: null,
    status: 'ATIVO',
    driverPhone: null,
    ...overrides,
  };
}

/** A server that applies every pushed item unless `results` says otherwise. */
function server(
  options: {
    results?: (item: PushItem) => PushResult;
    pull?: () => object;
    failWith?: { status: number; json: object };
  } = {},
) {
  const pushed: PushItem[] = [];
  const handler: FakeHandler = (method, path, body) => {
    if (options.failWith) return options.failWith;
    if (path === '/sync/push') {
      const items = (body as { items: PushItem[] }).items;
      pushed.push(...items);
      return {
        status: 200,
        json: {
          clockSkewSeconds: 0,
          results: items.map((i) => options.results?.(i) ?? { status: 'applied' }),
        },
      };
    }
    if (path.startsWith('/sync/pull'))
      return { status: 200, json: options.pull?.() ?? pullResponse() };
    if (path === '/sync/serial-blocks') return { status: 200, json: { blocks: BLOCKS } };
    return { status: 404, json: { error: 'NOT_FOUND', message: path } };
  };
  return { handler, pushed };
}

async function envWith(handler: FakeHandler) {
  const { api, calls } = fakeApi(handler);
  const env = await makeEnv(api);
  return { env, calls };
}

/** Phone that already synced once (reference data and blocks), then went offline. */
async function workedOffline(handler: FakeHandler) {
  const { env, calls } = await envWith(handler);
  await env.db.transaction(async (tx) => {
    await replaceReference(tx, pullResponseSchema.parse(pullResponse()));
    await mergeSerialBlocks(tx, BLOCKS);
  });
  const t1 = await issueTicket(env, session(), { plate: 'A-1', vehicleClassId: MOTO });
  const t2 = await issueTicket(env, session(), { plate: 'A-2', vehicleClassId: MOTO });
  env.advance(30 * MINUTE);
  await closeTicket(env, session(), t1.id, { expectedAmountCents: 50, receivedCents: 50 });
  return { env, calls, t1, t2 };
}

describe('sync', () => {
  it('first sync on a new phone downloads settings, tariffs and two serial blocks', async () => {
    const { env } = await envWith(server().handler);
    const report = await syncOnce(env, session());
    expect(report.state).toBe('ok');
    expect((await getSettings(env.db))?.chargingRule).toEqual({ minimumHours: 1, graceMinutes: 0 });
    expect(await remainingSerials(env.db)).toBe(100);
  });

  it('pushes the outbox in order, empties it and marks tickets synced', async () => {
    const srv = server();
    const { env, t1, t2 } = await workedOffline(srv.handler);
    const report = await syncOnce(env, session());

    expect(report).toMatchObject({ state: 'ok', pushed: 3, pending: 0, rejected: 0 });
    expect(srv.pushed.map((i) => i.kind)).toEqual([
      'TICKET_ISSUED',
      'TICKET_ISSUED',
      'TICKET_CLOSED',
    ]);
    expect(await countQueued(env.db)).toBe(0);
    expect((await getTicket(env.db, t1.id))?.syncState).toBe('synced');
    expect((await getTicket(env.db, t2.id))?.syncState).toBe('synced');
    // the two serials used offline are not handed out again
    expect(await remainingSerials(env.db)).toBe(98);
  });

  it('with no signal nothing is lost; the next sync sends everything once', async () => {
    let online = false;
    const srv = server();
    const { env } = await workedOffline((m, p, b) => (online ? srv.handler(m, p, b) : 'offline'));

    expect((await syncOnce(env, session())).state).toBe('offline');
    expect(await countQueued(env.db)).toBe(3);

    online = true;
    expect((await syncOnce(env, session())).pushed).toBe(3);
    expect((await syncOnce(env, session())).pushed).toBe(0);
    expect(srv.pushed).toHaveLength(3);
  });

  it('keeps pending items for later and rejected items for the agent to see', async () => {
    const srv = server({
      results: (i) =>
        i.kind === 'TICKET_CLOSED'
          ? { status: 'rejected', error: 'ALREADY_PAID', message: 'Ticket was already paid' }
          : i.kind === 'TICKET_ISSUED' && i.ticket.plate === 'A-2'
            ? { status: 'pending', message: 'try later' }
            : { status: 'applied' },
    });
    const { env, t1 } = await workedOffline(srv.handler);
    const report = await syncOnce(env, session());
    expect(report).toMatchObject({ pushed: 1, pending: 1, rejected: 1 });

    expect((await queuedFor(env.db, agentUser.id, 10)).map((r) => r.kind)).toEqual([
      'TICKET_ISSUED',
    ]);
    const [rejected] = await rejectedFor(env.db, agentUser.id);
    expect(rejected).toMatchObject({
      kind: 'TICKET_CLOSED',
      ticketId: t1.id,
      error: 'ALREADY_PAID',
    });
    expect((await getTicket(env.db, t1.id))?.status).toBe('PAGO'); // the phone's record stays

    srv.pushed.length = 0;
    await syncOnce(env, session());
    expect(srv.pushed.map((i) => i.kind)).toEqual(['TICKET_ISSUED']); // rejected is not resent
  });

  it('expired session: auth-required and the outbox is kept', async () => {
    const { env } = await workedOffline(
      server({ failWith: { status: 401, json: { error: 'UNAUTHENTICATED', message: 'expired' } } })
        .handler,
    );
    expect((await syncOnce(env, session())).state).toBe('auth-required');
    expect(await countQueued(env.db)).toBe(3);
    expect((await syncOnce(env, session({ token: null }))).state).toBe('auth-required');
  });

  it('blocked phone (FR-05): flags the device, keeps every local record', async () => {
    const { env, t1 } = await workedOffline(
      server({ failWith: { status: 403, json: { error: 'DEVICE_BLOCKED', message: 'blocked' } } })
        .handler,
    );
    expect((await syncOnce(env, session())).state).toBe('device-blocked');
    expect(await env.store.get('deviceBlocked')).toBe('1');
    expect(await countQueued(env.db)).toBe(3);
    expect(await getTicket(env.db, t1.id)).not.toBeNull();
  });

  describe('pull merge', () => {
    it('adds colleagues’ parked vehicles and drops them when someone else closes them', async () => {
      let pull = pullResponse({ tickets: [colleagueTicket()] });
      const { env } = await envWith(server({ pull: () => pull }).handler);
      await syncOnce(env, session());
      expect((await parkedInMyAreas(env.db, session())).map((t) => t.plate)).toEqual(['C-1-TL']);

      pull = pullResponse({ closedTicketIds: [colleagueTicket().id] });
      await syncOnce(env, session());
      expect(await parkedInMyAreas(env.db, session())).toEqual([]);
    });

    it('never lets an older server copy reopen a ticket this phone closed', async () => {
      const t = colleagueTicket();
      const { env } = await envWith(
        server({
          pull: () => pullResponse({ tickets: [t] }),
          results: () => ({ status: 'pending', message: 'later' }),
        }).handler,
      );
      await syncOnce(env, session());
      await closeTicket(env, session(), t.id, { expectedAmountCents: 50, receivedCents: 50 });

      await syncOnce(env, session()); // server still says ATIVO
      expect((await getTicket(env.db, t.id))?.status).toBe('PAGO');
    });
  });

  it('runs one sync at a time', async () => {
    const { env, calls } = await envWith(server().handler);
    const runner = new SyncRunner(env);
    const [a, b] = await Promise.all([runner.run(session()), runner.run(session())]);
    expect(a).toBe(b);
    expect(calls.filter((c) => c.path === '/sync/serial-blocks')).toHaveLength(1);
  });
});
