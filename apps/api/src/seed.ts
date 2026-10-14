// Reference data and the first admin. Safe to run more than once.
import { hashSecret } from './auth/secrets';
import type { Db } from './db';
import { parseSetting } from './settings';
import type { SettingKey } from './settings';

export const SEED_AREAS = ['Setor A', 'Setor B', 'Setor C'];

// TODO(AMD): nameTet values are a first draft; confirm with a Tetum speaker.
export const SEED_VEHICLE_CLASSES = [
  { code: 'MOTORIZADA', namePt: 'Motorizadas', nameTet: 'Motorizada', active: true },
  // TODO(AMD): tariffs for the classes below are not decided. They stay inactive (cannot be
  // issued) and get no tariff row until an admin sets one.
  { code: 'LIGEIRO', namePt: 'Veículos ligeiros', nameTet: "Karreta ki'ik", active: false },
  {
    code: 'PESADO_SEMI_REBOQUE',
    namePt: 'Pesados — semi-reboque',
    nameTet: 'Pezadu — semi-reboke',
    active: false,
  },
  {
    code: 'PESADO_MERCADORIAS',
    namePt: 'Pesados — mercadorias',
    nameTet: 'Pezadu — merkadoria',
    active: false,
  },
] as const;

/** Motorizadas 50 cents/hour, from the paper ticket. The only decided tariff. */
export const SEED_MOTORIZADA_CENTS_PER_HOUR = 50;
export const SEED_TARIFF_VALID_FROM = new Date('2026-01-01T00:00:00Z');

// Defaults for values AMD has not fixed. All editable in the settings table.
export const SEED_SETTINGS: { [K in SettingKey]: unknown } = {
  chargingRule: { minimumHours: 1, graceMinutes: 0 }, // BR-02, BR-03
  pinMaxAttempts: 5, // TODO(AMD): FR-03 does not say how many
  serialBlockSize: 50, // CLAUDE.md rule 7
  serialBlocksPerDevice: 2, // docs/DECISIONS.md
  clockSkewWarnSeconds: 300, // docs/DECISIONS.md
  agentSessionHours: 24, // TODO(AMD): confirm
  consoleSessionHours: 8, // TODO(AMD): confirm
  loginCodeTtlMinutes: 5,
  loginCodeMaxAttempts: 5,
};

export interface SeedOptions {
  admin: { username: string; password: string; name: string; phone: string | null };
  /** Development only: also create agent AMD-001 in Setor A with this PIN. */
  devAgentPin?: string;
}

export async function seed(db: Db, options: SeedOptions) {
  for (const [key, value] of Object.entries(SEED_SETTINGS) as [SettingKey, unknown][]) {
    const parsed = parseSetting(key, value) as object;
    await db.setting.upsert({ where: { key }, create: { key, value: parsed }, update: {} });
  }

  const areas = [];
  for (const name of SEED_AREAS) {
    areas.push(await db.area.upsert({ where: { name }, create: { name }, update: {} }));
  }

  for (const vc of SEED_VEHICLE_CLASSES) {
    await db.vehicleClass.upsert({ where: { code: vc.code }, create: vc, update: {} });
  }

  const admin = await db.user.upsert({
    where: { username: options.admin.username },
    create: {
      name: options.admin.name,
      username: options.admin.username,
      role: 'admin',
      phone: options.admin.phone,
      passwordHash: await hashSecret(options.admin.password),
    },
    update: {},
  });

  const moto = await db.vehicleClass.findUniqueOrThrow({ where: { code: 'MOTORIZADA' } });
  if ((await db.tariff.count({ where: { vehicleClassId: moto.id } })) === 0) {
    await db.tariff.create({
      data: {
        vehicleClassId: moto.id,
        centsPerHour: SEED_MOTORIZADA_CENTS_PER_HOUR,
        validFrom: SEED_TARIFF_VALID_FROM,
        changedById: admin.id,
      },
    });
  }

  if (options.devAgentPin) {
    const setorA = areas[0];
    if (!setorA) throw new Error('Setor A missing');
    await db.user.upsert({
      where: { agentNumber: 'AMD-001' },
      create: {
        name: 'Agente de Teste',
        agentNumber: 'AMD-001',
        role: 'agent',
        pinHash: await hashSecret(options.devAgentPin),
        areas: { create: { areaId: setorA.id } },
      },
      update: {},
    });
  }

  return { adminId: admin.id };
}
