// Local SQLite schema (NFR-01). Versioned with PRAGMA user_version; add migrations, never edit old ones.
// Money is integer cents; times are ISO-8601 UTC strings.
import type { SqlDb } from './types';

const MIGRATIONS: string[] = [
  // 1 — initial schema
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE areas (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL);

  CREATE TABLE vehicle_classes (
    id TEXT PRIMARY KEY, code TEXT NOT NULL, name_pt TEXT NOT NULL, name_tet TEXT NOT NULL,
    active INTEGER NOT NULL
  );

  CREATE TABLE tariffs (
    id TEXT PRIMARY KEY, vehicle_class_id TEXT NOT NULL, cents_per_hour INTEGER NOT NULL,
    valid_from TEXT NOT NULL, valid_until TEXT
  );

  -- Serial blocks held by this phone (FR-08). next = next unused serial in the block.
  CREATE TABLE serial_blocks (start INTEGER PRIMARY KEY, "end" INTEGER NOT NULL, next INTEGER NOT NULL);

  CREATE TABLE tickets (
    id TEXT PRIMARY KEY,
    serial TEXT NOT NULL UNIQUE,
    plate TEXT NOT NULL,
    vehicle_class_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    entry_at TEXT NOT NULL,
    exit_at TEXT,
    hours_charged INTEGER,
    tariff_cents_per_hour INTEGER NOT NULL CHECK (tariff_cents_per_hour >= 0),
    amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents >= 0),
    status TEXT NOT NULL CHECK (status IN ('ATIVO', 'PAGO')),
    driver_phone TEXT,
    -- Receipt data for payments taken on this phone
    payment_id TEXT,
    received_cents INTEGER,
    change_cents INTEGER,
    paid_by TEXT,
    -- 'local' while this phone has changes the server has not confirmed yet
    sync_state TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('local', 'synced'))
  );
  CREATE INDEX tickets_status_entry ON tickets (status, entry_at);
  CREATE INDEX tickets_agent_entry ON tickets (agent_id, entry_at);
  CREATE INDEX tickets_plate ON tickets (plate);

  -- Ativo → Pago only, also on the phone (BR-05).
  CREATE TRIGGER tickets_no_reopen BEFORE UPDATE OF status ON tickets
    WHEN OLD.status = 'PAGO' AND NEW.status <> 'PAGO'
    BEGIN SELECT RAISE(ABORT, 'A paid ticket cannot be reopened'); END;

  -- Outbox (docs/SYNC.md). Items are pushed with the session of user_id, in seq order.
  CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    ticket_id TEXT,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'rejected')),
    error TEXT,
    message TEXT
  );
  `,
];

export async function migrate(db: SqlDb): Promise<void> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[v]!);
      await tx.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export const SCHEMA_VERSION = MIGRATIONS.length;
