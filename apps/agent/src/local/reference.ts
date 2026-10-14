// Reference data pulled from the server: areas, vehicle classes, tariffs, settings.
import type { ChargingRule, PullResponse, TariffPeriod } from '@estacionamento/shared';
import type { SqlDb } from '../db/types';

export interface LocalSettings {
  chargingRule: ChargingRule;
  pinMaxAttempts: number;
  clockSkewWarnSeconds: number;
}

export interface LocalVehicleClass {
  id: string;
  code: string;
  namePt: string;
  nameTet: string;
  active: boolean;
}

export async function getMeta(db: SqlDb, key: string): Promise<string | null> {
  return (
    (await db.first<{ value: string }>('SELECT value FROM meta WHERE key = ?', key))?.value ?? null
  );
}

export async function setMeta(db: SqlDb, key: string, value: string): Promise<void> {
  await db.run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

/** Settings from the last pull, or null before the first sync. */
export async function getSettings(db: SqlDb): Promise<LocalSettings | null> {
  const raw = await getMeta(db, 'settings');
  return raw ? (JSON.parse(raw) as LocalSettings) : null;
}

export async function getVehicleClasses(db: SqlDb): Promise<LocalVehicleClass[]> {
  const rows = await db.all<{
    id: string;
    code: string;
    name_pt: string;
    name_tet: string;
    active: number;
  }>('SELECT * FROM vehicle_classes ORDER BY code');
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    namePt: r.name_pt,
    nameTet: r.name_tet,
    active: r.active === 1,
  }));
}

export async function getTariffs(db: SqlDb, vehicleClassId: string): Promise<TariffPeriod[]> {
  const rows = await db.all<{
    vehicle_class_id: string;
    cents_per_hour: number;
    valid_from: string;
    valid_until: string | null;
  }>('SELECT * FROM tariffs WHERE vehicle_class_id = ?', vehicleClassId);
  return rows.map((r) => ({
    vehicleClassId: r.vehicle_class_id,
    centsPerHour: r.cents_per_hour,
    validFrom: new Date(r.valid_from),
    validUntil: r.valid_until ? new Date(r.valid_until) : null,
  }));
}

/** Replace all reference data with what the server sent (it is small, sent whole each pull). */
export async function replaceReference(tx: SqlDb, pull: PullResponse): Promise<void> {
  await tx.run('DELETE FROM areas');
  for (const a of pull.areas) {
    await tx.run(
      'INSERT INTO areas (id, name, active) VALUES (?, ?, ?)',
      a.id,
      a.name,
      a.active ? 1 : 0,
    );
  }
  await tx.run('DELETE FROM vehicle_classes');
  for (const c of pull.vehicleClasses) {
    await tx.run(
      'INSERT INTO vehicle_classes (id, code, name_pt, name_tet, active) VALUES (?, ?, ?, ?, ?)',
      c.id,
      c.code,
      c.namePt,
      c.nameTet,
      c.active ? 1 : 0,
    );
  }
  await tx.run('DELETE FROM tariffs');
  for (const t of pull.tariffs) {
    await tx.run(
      'INSERT INTO tariffs (id, vehicle_class_id, cents_per_hour, valid_from, valid_until) VALUES (?, ?, ?, ?, ?)',
      t.id,
      t.vehicleClassId,
      t.centsPerHour,
      t.validFrom,
      t.validUntil,
    );
  }
  await setMeta(tx, 'settings', JSON.stringify(pull.settings));
}
