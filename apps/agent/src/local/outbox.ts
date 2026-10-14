// Outbox of changes waiting to reach the server (CLAUDE.md rule 6, docs/SYNC.md §3).
import type { PushItem } from '@estacionamento/shared';
import type { SqlDb } from '../db/types';

export interface OutboxRow {
  seq: number;
  id: string;
  userId: string;
  kind: PushItem['kind'];
  ticketId: string | null;
  item: PushItem;
  attempts: number;
  state: 'queued' | 'rejected';
  error: string | null;
  message: string | null;
}

interface RawRow {
  seq: number;
  id: string;
  user_id: string;
  kind: PushItem['kind'];
  ticket_id: string | null;
  payload: string;
  attempts: number;
  state: 'queued' | 'rejected';
  error: string | null;
  message: string | null;
}

const toRow = (r: RawRow): OutboxRow => ({
  seq: r.seq,
  id: r.id,
  userId: r.user_id,
  kind: r.kind,
  ticketId: r.ticket_id,
  item: JSON.parse(r.payload) as PushItem,
  attempts: r.attempts,
  state: r.state,
  error: r.error,
  message: r.message,
});

export async function enqueue(
  tx: SqlDb,
  entry: { id: string; userId: string; item: PushItem; ticketId?: string; createdAt: Date },
): Promise<void> {
  await tx.run(
    'INSERT INTO outbox (id, user_id, kind, ticket_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    entry.id,
    entry.userId,
    entry.item.kind,
    entry.ticketId ?? null,
    JSON.stringify(entry.item),
    entry.createdAt.toISOString(),
  );
}

export async function queuedFor(db: SqlDb, userId: string, limit: number): Promise<OutboxRow[]> {
  const rows = await db.all<RawRow>(
    "SELECT * FROM outbox WHERE user_id = ? AND state = 'queued' ORDER BY seq LIMIT ?",
    userId,
    limit,
  );
  return rows.map(toRow);
}

export async function rejectedFor(db: SqlDb, userId: string): Promise<OutboxRow[]> {
  const rows = await db.all<RawRow>(
    "SELECT * FROM outbox WHERE user_id = ? AND state = 'rejected' ORDER BY seq",
    userId,
  );
  return rows.map(toRow);
}

export async function countQueued(db: SqlDb, userId?: string): Promise<number> {
  const row = userId
    ? await db.first<{ n: number }>(
        "SELECT COUNT(*) AS n FROM outbox WHERE state = 'queued' AND user_id = ?",
        userId,
      )
    : await db.first<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE state = 'queued'");
  return row?.n ?? 0;
}
