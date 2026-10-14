// Serial numbers from the blocks the server gave this phone (FR-08, docs/SYNC.md §2).
import type { SerialBlock } from '@estacionamento/shared';
import type { SqlDb } from '../db/types';

/** Takes the next unused serial number, or null when every block is used up. Call inside a transaction. */
export async function takeNextSerial(tx: SqlDb): Promise<number | null> {
  const block = await tx.first<{ start: number; next: number }>(
    'SELECT start, next FROM serial_blocks WHERE next <= "end" ORDER BY start LIMIT 1',
  );
  if (!block) return null;
  await tx.run('UPDATE serial_blocks SET next = next + 1 WHERE start = ?', block.start);
  return block.next;
}

export async function remainingSerials(db: SqlDb): Promise<number> {
  const row = await db.first<{ n: number | null }>(
    'SELECT SUM("end" - next + 1) AS n FROM serial_blocks WHERE next <= "end"',
  );
  return row?.n ?? 0;
}

/**
 * Merge the open blocks the server reports. Local `next` is kept (the phone may be ahead of the
 * server). Blocks the server no longer lists are dropped once they are used up locally.
 */
export async function mergeSerialBlocks(tx: SqlDb, blocks: SerialBlock[]): Promise<void> {
  for (const b of blocks) {
    await tx.run(
      'INSERT INTO serial_blocks (start, "end", next) VALUES (?, ?, ?) ON CONFLICT (start) DO NOTHING',
      b.start,
      b.end,
      b.start,
    );
  }
  const starts = blocks.map((b) => b.start);
  const used = await tx.all<{ start: number }>(
    'SELECT start FROM serial_blocks WHERE next > "end"',
  );
  for (const { start } of used) {
    if (!starts.includes(start)) await tx.run('DELETE FROM serial_blocks WHERE start = ?', start);
  }
}
