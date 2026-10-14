import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import { SEED_VEHICLE_CLASSES } from '../src/seed';
import { getSetting } from '../src/settings';
import { hasTestDb, seedTestDb, testDb } from './helpers';

// Other test files add their own classes; look only at the seeded ones.
const seededCodes = SEED_VEHICLE_CLASSES.map((c) => c.code);

describe.skipIf(!hasTestDb)('seed', () => {
  let db: Db;

  beforeAll(async () => {
    db = testDb();
    await seedTestDb(db);
    await seedTestDb(db); // twice: must be idempotent
  });
  afterAll(() => db.$disconnect());

  it('creates Setor A–C once', async () => {
    const areas = await db.area.findMany({ where: { name: { startsWith: 'Setor ' } } });
    expect(areas.map((a) => a.name).sort()).toEqual(['Setor A', 'Setor B', 'Setor C']);
  });

  it('only Motorizadas is active, with exactly one tariff of 50 cents/hour', async () => {
    const classes = await db.vehicleClass.findMany({
      where: { code: { in: seededCodes } },
      include: { tariffs: true },
    });
    const active = classes.filter((c) => c.active);
    expect(active.map((c) => c.code)).toEqual(['MOTORIZADA']);
    expect(active[0]?.tariffs.map((t) => t.centsPerHour)).toEqual([50]);
  });

  it('does not invent tariffs for cars or heavy vehicles', async () => {
    const others = await db.vehicleClass.findMany({
      where: { code: { in: seededCodes, not: 'MOTORIZADA' } },
      include: { tariffs: true },
    });
    expect(others).toHaveLength(3);
    for (const c of others) {
      expect(c.active).toBe(false);
      expect(c.tariffs).toEqual([]);
    }
  });

  it('creates one admin with a hashed password', async () => {
    const admins = await db.user.findMany({ where: { username: 'admin' } });
    expect(admins).toHaveLength(1);
    expect(admins[0]?.role).toBe('admin');
    expect(admins[0]?.passwordHash).toMatch(/^scrypt\$/);
  });

  it('stores the configurable rules', async () => {
    expect(await getSetting(db, 'chargingRule')).toEqual({ minimumHours: 1, graceMinutes: 0 });
    expect(await getSetting(db, 'serialBlockSize')).toBe(50);
  });
});
