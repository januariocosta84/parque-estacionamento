// Test doubles: node:sqlite in place of expo-sqlite, a Map in place of the secure store.
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { SessionUser } from '@estacionamento/shared';
import { ApiClient } from '../src/api';
import { migrate } from '../src/db/schema';
import type { SqlDb, SqlValue } from '../src/db/types';
import type { Env, SecureStore } from '../src/env';
import type { Session } from '../src/session';

export function nodeDb(): SqlDb {
  const raw = new DatabaseSync(':memory:');
  let depth = 0;
  const db: SqlDb = {
    exec: async (sql) => void raw.exec(sql),
    run: async (sql, ...params: SqlValue[]) => ({
      changes: Number(raw.prepare(sql).run(...params).changes),
    }),
    all: async <T>(sql: string, ...params: SqlValue[]) => raw.prepare(sql).all(...params) as T[],
    first: async <T>(sql: string, ...params: SqlValue[]) =>
      (raw.prepare(sql).get(...params) as T | undefined) ?? null,
    transaction: async <T>(fn: (tx: SqlDb) => Promise<T>) => {
      if (depth > 0) return fn(db);
      depth++;
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(db);
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      } finally {
        depth--;
      }
    },
  };
  return db;
}

export function memoryStore(): SecureStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
  };
}

export type FakeHandler = (
  method: string,
  path: string,
  body: unknown,
) => { status: number; json?: unknown } | 'offline';

/** An ApiClient whose network is a function, so tests decide each answer. */
export function fakeApi(handler: FakeHandler) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const api = new ApiClient('http://api.test', async (url, init) => {
    const path = url.replace('http://api.test', '');
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method: init.method!, path, body });
    const answer = handler(init.method!, path, body);
    if (answer === 'offline') throw new TypeError('Network request failed');
    return new Response(answer.json === undefined ? '' : JSON.stringify(answer.json), {
      status: answer.status,
    });
  });
  return { api, calls };
}

export async function makeEnv(api: ApiClient, start = new Date('2026-10-13T00:20:00Z')) {
  const db = nodeDb();
  await migrate(db);
  let now = start;
  const env: Env & { setNow(d: Date): void; advance(ms: number): void } = {
    db,
    store: memoryStore(),
    api,
    now: () => now,
    newId: () => randomUUID(),
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    setNow: (d) => {
      now = d;
    },
    advance: (ms) => {
      now = new Date(now.getTime() + ms);
    },
  };
  return env;
}

export const AREA_A = '00000000-0000-4000-8000-00000000000a';
export const AREA_B = '00000000-0000-4000-8000-00000000000b';
export const MOTO = '00000000-0000-4000-8000-0000000000c1';
export const CAR = '00000000-0000-4000-8000-0000000000c2';

export const agentUser: SessionUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Agente Teste',
  agentNumber: 'AMD-017',
  username: null,
  role: 'agent',
  status: 'ACTIVE',
  areaIds: [AREA_A],
};

export function session(overrides: Partial<Session> = {}): Session {
  return {
    user: agentUser,
    deviceId: '00000000-0000-4000-8000-0000000000d1',
    token: 'token-123456789012345678901234567890',
    mode: 'online',
    ...overrides,
  };
}

/** A pull response like the server's, with Motorizadas at 50 c/h and cars inactive. */
export function pullResponse(overrides: Record<string, unknown> = {}) {
  return {
    cursor: '2026-10-13T00:00:00.000Z',
    hasMore: false,
    areas: [{ id: AREA_A, name: 'Setor A', active: true }],
    vehicleClasses: [
      { id: MOTO, code: 'MOTORIZADA', namePt: 'Motorizadas', nameTet: 'Motorizada', active: true },
      {
        id: CAR,
        code: 'LIGEIRO',
        namePt: 'Veículos ligeiros',
        nameTet: "Karreta ki'ik",
        active: false,
      },
    ],
    tariffs: [
      {
        id: '00000000-0000-4000-8000-0000000000f1',
        vehicleClassId: MOTO,
        centsPerHour: 50,
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
        changedBy: agentUser.id,
      },
    ],
    settings: {
      chargingRule: { minimumHours: 1, graceMinutes: 0 },
      pinMaxAttempts: 5,
      clockSkewWarnSeconds: 300,
    },
    tickets: [],
    closedTicketIds: [],
    ...overrides,
  };
}
