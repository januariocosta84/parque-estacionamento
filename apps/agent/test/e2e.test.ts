// End to end: the phone's offline code against a real running API (NFR-01).
// Runs only when AGENT_E2E_API_URL, AGENT_E2E_AGENT and AGENT_E2E_PIN are set, e.g. against
// `pnpm dev` with the dev seed (SEED_DEV_AGENT_PIN).
import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { listTicketsResponseSchema } from '@estacionamento/shared';
import { ApiClient } from '../src/api';
import { signIn } from '../src/auth';
import { migrate } from '../src/db/schema';
import type { Env } from '../src/env';
import { countQueued } from '../src/local/outbox';
import { getVehicleClasses } from '../src/local/reference';
import { closeTicket, getTicket, issueTicket, quoteExit } from '../src/local/tickets';
import { syncOnce } from '../src/sync';
import { memoryStore, nodeDb } from './helpers';

const baseUrl = process.env.AGENT_E2E_API_URL;
const agentNumber = process.env.AGENT_E2E_AGENT;
const pin = process.env.AGENT_E2E_PIN;

describe.skipIf(!baseUrl || !agentNumber || !pin)('phone ↔ API end to end', () => {
  it('signs in online, works offline, and syncs everything once when signal returns', async () => {
    let online = true;
    const api = new ApiClient(baseUrl!, (url, init) =>
      online ? fetch(url, init) : Promise.reject(new TypeError('Network request failed')),
    );
    const db = nodeDb();
    await migrate(db);
    const env: Env = {
      db,
      store: memoryStore(),
      api,
      now: () => new Date(),
      newId: () => randomUUID(),
      randomBytes: (n) => new Uint8Array(randomBytes(n)),
    };

    const first = await signIn(env, agentNumber!, pin!);
    if (!first.ok) throw new Error(`online sign-in failed: ${first.reason}`);
    expect((await syncOnce(env, first.session)).state).toBe('ok');
    const moto = (await getVehicleClasses(db)).find((c) => c.code === 'MOTORIZADA')!;

    // ── No signal ──
    online = false;
    const offline = await signIn(env, agentNumber!, pin!);
    if (!offline.ok) throw new Error(`offline sign-in failed: ${offline.reason}`);
    expect(offline.session.mode).toBe('offline');
    const session = { ...offline.session, token: first.session.token };

    const a = await issueTicket(env, session, {
      plate: `E2E-${Date.now() % 100000}`,
      vehicleClassId: moto.id,
    });
    const b = await issueTicket(env, session, {
      plate: `E2E-${(Date.now() + 1) % 100000}`,
      vehicleClassId: moto.id,
    });
    const quote = await quoteExit(env, session, a.id);
    const receipt = await closeTicket(env, session, a.id, {
      expectedAmountCents: quote.amountCents,
      receivedCents: quote.amountCents + 50,
    });
    expect(receipt.changeCents).toBe(50);
    expect((await syncOnce(env, session)).state).toBe('offline');
    expect(await countQueued(db)).toBe(4); // sign-in, 2 issues, 1 close

    // ── Signal back ──
    online = true;
    const report = await syncOnce(env, session);
    expect(report).toMatchObject({ state: 'ok', pushed: 4, rejected: 0, pending: 0 });
    expect(await countQueued(db)).toBe(0);
    expect((await getTicket(db, a.id))?.syncState).toBe('synced');

    // The server now has both tickets, one paid with the phone's receipt number.
    const res = await fetch(`${baseUrl}/tickets?q=${encodeURIComponent(a.serial.slice(0, 7))}`, {
      headers: { authorization: `Bearer ${first.session.token}` },
    });
    const server = listTicketsResponseSchema.parse(await res.json());
    expect(server.items[0]).toMatchObject({
      id: a.id,
      status: 'PAGO',
      amountCents: quote.amountCents,
    });
    expect(server.items[0]?.lastEventRef).toBe(receipt.paymentRef);

    // A second sync sends nothing again (idempotent).
    expect((await syncOnce(env, session)).pushed).toBe(0);
    expect((await getTicket(db, b.id))?.status).toBe('ATIVO');
  });
});
