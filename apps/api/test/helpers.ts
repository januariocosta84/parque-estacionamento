import { randomUUID } from 'node:crypto';
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

let nextBlockStart = 5_000_000;
/** Allocate a fresh serial block to a device directly in the database (the API comes in M4). */
export async function allocateTestBlock(db: Db, deviceId: string, size = 50) {
  const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const start = nextBlockStart;
  nextBlockStart += 1000;
  return db.serialBlock.create({
    data: { deviceId, start, end: start + size - 1, allocatedById: admin.id },
  });
}
