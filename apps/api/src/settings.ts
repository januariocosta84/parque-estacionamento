// Values AMD has not fixed yet live in the `settings` table so they can change without a release.
// Seeded by prisma/seed.ts; a missing setting is a deployment error, not something to guess.
import { z } from 'zod';
import type { Db } from './db';

const settingSchemas = {
  /** BR-02 / BR-03 (part-hour rule to confirm). */
  chargingRule: z.object({
    minimumHours: z.int().min(1),
    graceMinutes: z.int().min(0).max(59),
  }),
  /** FR-03: wrong PINs before the agent account locks. */
  pinMaxAttempts: z.int().min(1),
  /** FR-08: serial numbers handed to a device at a time. */
  serialBlockSize: z.int().min(1),
  /** Open serial blocks a phone holds: one in use plus spares (docs/SYNC.md). */
  serialBlocksPerDevice: z.int().min(1),
  /** Phone clock this far off the server is flagged on synced events. */
  clockSkewWarnSeconds: z.int().min(1),
  agentSessionHours: z.int().min(1),
  consoleSessionHours: z.int().min(1),
  loginCodeTtlMinutes: z.int().min(1),
  loginCodeMaxAttempts: z.int().min(1),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;

export async function getSetting<K extends SettingKey>(db: Db, key: K): Promise<SettingValue<K>> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) throw new Error(`Setting "${key}" is missing — run the seed (pnpm db:seed)`);
  return settingSchemas[key].parse(row.value) as SettingValue<K>;
}

export function parseSetting<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  return settingSchemas[key].parse(value) as SettingValue<K>;
}
