// Serial block allocation (FR-08, docs/SYNC.md §2).
import { nextSerialBlock } from '@estacionamento/shared';
import type { Db } from '../db';
import { getSetting } from '../settings';

interface BlockUsage {
  start: number;
  end: number;
  used: number;
}

/**
 * Make sure the phone holds `serialBlocksPerDevice` open blocks (blocks with at least one
 * serial not yet seen on a synced ticket), allocating new ones as needed. Idempotent.
 */
export async function ensureSerialBlocks(db: Db, deviceId: string, userId: string) {
  const size = await getSetting(db, 'serialBlockSize');
  const perDevice = await getSetting(db, 'serialBlocksPerDevice');

  return db.$transaction(async (tx) => {
    // One allocator at a time across all phones, so blocks are handed out in order.
    // ($executeRaw: the function returns void, which $queryRaw cannot read.)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('serial_blocks'))`;

    const usage = await tx.$queryRaw<BlockUsage[]>`
      SELECT b.start, b."end", count(t.id)::int AS used
      FROM serial_blocks b
      LEFT JOIN tickets t
        ON t.device_id = b.device_id
       AND split_part(t.serial, '/', 1)::int BETWEEN b.start AND b."end"
      WHERE b.device_id = ${deviceId}::uuid
      GROUP BY b.id, b.start, b."end"
      ORDER BY b.start`;
    const open = usage
      .filter((b) => b.used < b.end - b.start + 1)
      .map(({ start, end }) => ({ start, end }));

    while (open.length < perDevice) {
      const last = await tx.serialBlock.aggregate({ _max: { end: true } });
      const block = nextSerialBlock(last._max.end, size);
      await tx.serialBlock.create({ data: { deviceId, ...block, allocatedById: userId } });
      await tx.device.update({
        where: { id: deviceId },
        data: { serialBlockStart: block.start, serialBlockEnd: block.end },
      });
      open.push(block);
    }
    return open;
  });
}
