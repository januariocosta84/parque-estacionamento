import { describe, expect, it } from 'vitest';
import { nodeDb } from './helpers';

describe('single-connection SqlDb (phones keep the SQLCipher key on one connection)', () => {
  it('a statement issued during a transaction waits until the transaction commits', async () => {
    const db = nodeDb();
    await db.exec('CREATE TABLE t (n INTEGER)');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    const tx = db.transaction(async (t) => {
      await t.run('INSERT INTO t VALUES (1)');
      await gate;
      await t.run('INSERT INTO t VALUES (2)');
    });
    const outside = db.all<{ n: number }>('SELECT n FROM t ORDER BY n');
    release();
    await tx;
    expect(await outside).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('a failed transaction rolls back and the next one still runs', async () => {
    const db = nodeDb();
    await db.exec('CREATE TABLE t (n INTEGER)');
    await expect(
      db.transaction(async (t) => {
        await t.run('INSERT INTO t VALUES (1)');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await db.transaction((t) => t.run('INSERT INTO t VALUES (2)'));
    expect(await db.all('SELECT n FROM t')).toEqual([{ n: 2 }]);
  });

  it('nested transactions join the outer one', async () => {
    const db = nodeDb();
    await db.exec('CREATE TABLE t (n INTEGER)');
    await db.transaction((t) => t.transaction((inner) => inner.run('INSERT INTO t VALUES (3)')));
    expect(await db.first('SELECT n FROM t')).toEqual({ n: 3 });
  });
});
