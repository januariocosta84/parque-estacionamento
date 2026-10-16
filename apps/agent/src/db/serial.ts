// SqlDb over one expo-sqlite connection, with transactions as plain BEGIN/COMMIT.
//
// expo-sqlite's withExclusiveTransactionAsync opens a second connection, which never receives the
// SQLCipher key and so cannot read the encrypted database. Instead every statement goes through one
// promise queue: a transaction holds the queue until it commits, so no other statement can slip
// into it. Statements inside a transaction use the `tx` handle and run directly.
import type { SqlDb, SqlValue } from './types';

/** The few expo-sqlite methods used here (SQLiteDatabase satisfies this). */
export interface RawDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
}

export function serialDb(raw: RawDb): SqlDb {
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task);
    queue = next.catch(() => undefined);
    return next;
  };

  const direct: SqlDb = {
    exec: (sql) => raw.execAsync(sql),
    run: async (sql, ...params) => ({ changes: (await raw.runAsync(sql, params)).changes }),
    all: (sql, ...params) => raw.getAllAsync(sql, params),
    first: (sql, ...params) => raw.getFirstAsync(sql, params),
    transaction: (fn) => fn(direct),
  };

  return {
    exec: (sql) => enqueue(() => direct.exec(sql)),
    run: (sql, ...params) => enqueue(() => direct.run(sql, ...params)),
    all: (sql, ...params) => enqueue(() => direct.all(sql, ...params)),
    first: (sql, ...params) => enqueue(() => direct.first(sql, ...params)),
    transaction: (fn) =>
      enqueue(async () => {
        await raw.execAsync('BEGIN IMMEDIATE');
        try {
          const result = await fn(direct);
          await raw.execAsync('COMMIT');
          return result;
        } catch (err) {
          await raw.execAsync('ROLLBACK');
          throw err;
        }
      }),
  };
}
