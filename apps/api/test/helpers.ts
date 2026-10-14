import { randomUUID } from 'node:crypto';
import { formatSerial } from '@estacionamento/shared';
import { hashSecret } from '../src/auth/secrets';
import { createDb } from '../src/db';
import type { Db } from '../src/db';
import { seed } from '../src/seed';

export const testDbUrl = process.env.DATABASE_URL_TEST;
export const hasTestDb = Boolean(testDbUrl);

export function testDb(): Db {
  if (!testDbUrl) throw new Error('DATABASE_URL_TEST is not set');
  return createDb(testDbUrl);
}

export const ADMIN_PASSWORD = 'test-admin-password';

export function seedTestDb(db: Db) {
  return seed(db, {
    admin: { username: 'admin', password: ADMIN_PASSWORD, name: 'Admin', phone: '+67000000000' },
  });
}

let counter = 0;
/** Unique suffix so tests never collide in the shared, append-only database. */
export function unique(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter}`.toUpperCase();
}

export async function createAgent(
  db: Db,
  { pin = '123456', areaName = 'Setor A' }: { pin?: string; areaName?: string } = {},
) {
  const area = await db.area.findUniqueOrThrow({ where: { name: areaName } });
  return db.user.create({
    data: {
      name: 'Agente',
      agentNumber: `T-${unique()}`,
      role: 'agent',
      pinHash: await hashSecret(pin),
      areas: { create: { areaId: area.id } },
    },
  });
}

export async function createConsoleUser(
  db: Db,
  role: 'supervisor' | 'finance' | 'auditor' | 'admin',
  { password = 'console-password', areaName = 'Setor A' } = {},
) {
  const area = await db.area.findUniqueOrThrow({ where: { name: areaName } });
  return db.user.create({
    data: {
      name: role,
      username: `${role}-${unique()}`.toLowerCase(),
      role,
      phone: '+67000000001',
      passwordHash: await hashSecret(password),
      areas: { create: { areaId: area.id } },
    },
  });
}

export const newDeviceId = () => randomUUID();

/** A new area of its own, so totals in a test are not mixed with other tests. */
export function createArea(db: Db) {
  return db.area.create({ data: { name: `Area ${unique()}` } });
}

type App = { inject: (opts: object) => Promise<{ json(): unknown; statusCode: number }> };

/** An agent signed in on a phone that holds a serial block; `issue` and `pay` call the API. */
export async function agentOnPhone(app: App, db: Db, areaName: string, vehicleClassId: string) {
  const agent = await createAgent(db, { areaName });
  const deviceId = newDeviceId();
  const login = await app.inject({
    method: 'POST',
    url: '/auth/agent/login',
    payload: { agentNumber: agent.agentNumber, pin: '123456', deviceId },
  });
  const token = (login.json() as { token: string }).token;
  const block = await allocateTestBlock(db, deviceId);
  let next = block.start;
  const headers = { authorization: `Bearer ${token}` };
  return {
    agent,
    token,
    headers,
    async issue(plate = 'A-1-TL') {
      const res = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers,
        payload: { id: randomUUID(), serial: formatSerial(next++), plate, vehicleClassId },
      });
      return (res.json() as { ticket: { id: string; serial: string } }).ticket;
    },
    async pay(ticketId: string, amountCents = 50) {
      return app.inject({
        method: 'POST',
        url: `/tickets/${ticketId}/exit`,
        headers,
        payload: {
          paymentId: randomUUID(),
          method: 'CASH',
          expectedAmountCents: amountCents,
          receivedCents: amountCents,
        },
      });
    },
  };
}

/** A console user signed in with password and the SMS code from the memory sender. */
export async function consoleSession(
  app: App,
  db: Db,
  sms: { sent: { text: string }[] },
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
    payload: { challengeId: (step1.json() as { challengeId: string }).challengeId, code },
  });
  const token = (step2.json() as { token: string }).token;
  return { user, token, headers: { authorization: `Bearer ${token}` } };
}

/**
 * Allocate a fresh serial block to a device directly in the database, after the highest block
 * so far (each test file has its own module state, so a counter here would collide).
 */
export async function allocateTestBlock(db: Db, deviceId: string, size = 50) {
  const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const last = await db.serialBlock.aggregate({ _max: { end: true } });
  const start = Math.max(last._max.end ?? 0, 5_000_000) + 1;
  return db.serialBlock.create({
    data: { deviceId, start, end: start + size - 1, allocatedById: admin.id },
  });
}
