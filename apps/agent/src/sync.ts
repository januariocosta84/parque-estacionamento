// One sync = push the outbox, pull changes, top up serial blocks (docs/SYNC.md §6).
// Never throws for network trouble: the app keeps working offline and tries again later.
import type { PullResponse, Ticket } from '@estacionamento/shared';
import { ApiRequestError, NetworkError } from './api';
import type { SqlDb } from './db/types';
import type { Env } from './env';
import { countQueued, queuedFor } from './local/outbox';
import { getMeta, replaceReference, setMeta } from './local/reference';
import { mergeSerialBlocks } from './local/serials';
import type { Session } from './session';

export type SyncState =
  | 'ok'
  /** No answer from the server; try again later. */
  | 'offline'
  /** The session token is missing or expired: sign in online once (outbox is kept). */
  | 'auth-required'
  /** This phone was blocked by a supervisor (FR-05): lock the app, keep the data. */
  | 'device-blocked'
  /** The agent's account was locked on the server. */
  | 'account-locked';

export interface SyncReport {
  state: SyncState;
  pushed: number;
  pending: number;
  rejected: number;
}

const BATCH = 200;

async function pushOutbox(env: Env, session: Session, report: SyncReport) {
  for (;;) {
    const rows = await queuedFor(env.db, session.user.id, BATCH);
    if (rows.length === 0) return;

    const res = await env.api.push({
      deviceTime: env.now().toISOString(),
      items: rows.map((r) => r.item),
    });
    let progressed = false;

    await env.db.transaction(async (tx) => {
      for (const [i, row] of rows.entries()) {
        const result = res.results[i];
        if (!result) continue;
        if (result.status === 'applied' || result.status === 'duplicate') {
          await tx.run('DELETE FROM outbox WHERE seq = ?', row.seq);
          if (row.ticketId) await markSyncedIfDone(tx, row.ticketId);
          report.pushed++;
          progressed = true;
        } else if (result.status === 'pending') {
          await tx.run(
            'UPDATE outbox SET attempts = attempts + 1, message = ? WHERE seq = ?',
            result.message,
            row.seq,
          );
          report.pending++;
        } else {
          // Kept and shown to the agent; never silently dropped.
          await tx.run(
            "UPDATE outbox SET state = 'rejected', attempts = attempts + 1, error = ?, message = ? WHERE seq = ?",
            result.error,
            result.message,
            row.seq,
          );
          report.rejected++;
          progressed = true;
        }
      }
    });
    if (!progressed || rows.length < BATCH) return;
  }
}

async function markSyncedIfDone(tx: SqlDb, ticketId: string) {
  const left = await tx.first<{ n: number }>(
    'SELECT COUNT(*) AS n FROM outbox WHERE ticket_id = ?',
    ticketId,
  );
  if ((left?.n ?? 0) === 0)
    await tx.run("UPDATE tickets SET sync_state = 'synced' WHERE id = ?", ticketId);
}

/** Server copy of a ticket, unless this phone has changes the server has not seen yet. */
async function mergeTicket(tx: SqlDb, t: Ticket) {
  const local = await tx.first<{ status: string; sync_state: string }>(
    'SELECT status, sync_state FROM tickets WHERE id = ?',
    t.id,
  );
  if (local?.sync_state === 'local') return; // local wins until pushed
  if (local?.status === 'PAGO' && t.status === 'ATIVO') return; // never reopen (BR-05)
  await tx.run(
    `INSERT INTO tickets (id, serial, plate, vehicle_class_id, area_id, agent_id, device_id, entry_at,
       exit_at, hours_charged, tariff_cents_per_hour, amount_cents, status, driver_phone, sync_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
     ON CONFLICT (id) DO UPDATE SET exit_at = excluded.exit_at, hours_charged = excluded.hours_charged,
       amount_cents = excluded.amount_cents, status = excluded.status, sync_state = 'synced'`,
    t.id,
    t.serial,
    t.plate,
    t.vehicleClassId,
    t.areaId,
    t.agentId,
    t.deviceId,
    t.entryAt,
    t.exitAt,
    t.hoursCharged,
    t.tariffCentsPerHour,
    t.amountCents,
    t.status,
    t.driverPhone ?? null,
  );
}

async function applyPull(tx: SqlDb, session: Session, pull: PullResponse, first: boolean) {
  await replaceReference(tx, pull);
  if (first) {
    // A first pull is a full snapshot of colleagues' parked vehicles: forget older copies.
    await tx.run(
      "DELETE FROM tickets WHERE agent_id <> ? AND sync_state = 'synced'",
      session.user.id,
    );
  }
  for (const t of pull.tickets) await mergeTicket(tx, t);
  for (const id of pull.closedTicketIds) {
    // Someone else closed a colleague's ticket: drop it from my parked list.
    await tx.run(
      "DELETE FROM tickets WHERE id = ? AND agent_id <> ? AND sync_state = 'synced'",
      id,
      session.user.id,
    );
  }
}

async function pullChanges(env: Env, session: Session) {
  let since = await getMeta(env.db, 'pullCursor');
  const first = since === null;
  for (;;) {
    const pull = await env.api.pull(since);
    await env.db.transaction(async (tx) => {
      await applyPull(tx, session, pull, first && since === null);
      await setMeta(tx, 'pullCursor', pull.cursor);
    });
    since = pull.cursor;
    if (!pull.hasMore) return;
  }
}

export async function syncOnce(env: Env, session: Session): Promise<SyncReport> {
  const report: SyncReport = { state: 'ok', pushed: 0, pending: 0, rejected: 0 };
  if (!session.token) return { ...report, state: 'auth-required' };
  env.api.token = session.token;

  try {
    await pushOutbox(env, session, report);
    await pullChanges(env, session);
    const { blocks } = await env.api.serialBlocks();
    await env.db.transaction((tx) => mergeSerialBlocks(tx, blocks));
    await setMeta(env.db, 'lastSyncAt', env.now().toISOString());
    return report;
  } catch (err) {
    if (err instanceof NetworkError) return { ...report, state: 'offline' };
    if (err instanceof ApiRequestError) {
      if (err.code === 'DEVICE_BLOCKED') {
        await env.store.set('deviceBlocked', '1');
        return { ...report, state: 'device-blocked' };
      }
      if (err.code === 'ACCOUNT_LOCKED') return { ...report, state: 'account-locked' };
      if (err.code === 'UNAUTHENTICATED') return { ...report, state: 'auth-required' };
    }
    throw err;
  }
}

/** Runs one sync at a time; extra requests while running are folded into the running one. */
export class SyncRunner {
  private running: Promise<SyncReport> | null = null;

  constructor(private readonly env: Env) {}

  run(session: Session): Promise<SyncReport> {
    if (!this.running) {
      this.running = syncOnce(this.env, session).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  pendingCount(userId: string) {
    return countQueued(this.env.db, userId);
  }
}
