// Browser-preview SqlDb (expo-sqlite web has no withExclusiveTransactionAsync). Transactions are
// serialised with a promise queue and plain BEGIN/COMMIT. Phones use expo.ts.
import * as SQLite from 'expo-sqlite';
import type { SqlDb, SqlValue } from './types';

export async function openWebDb(name: string): Promise<SqlDb> {
  const raw = await SQLite.openDatabaseAsync(name);
  let queue: Promise<unknown> = Promise.resolve();

  const base = {
    exec: (sql: string) => raw.execAsync(sql),
    run: async (sql: string, ...params: SqlValue[]) => ({
      changes: (await raw.runAsync(sql, params)).changes,
    }),
    all: <T>(sql: string, ...params: SqlValue[]) => raw.getAllAsync<T>(sql, params),
    first: <T>(sql: string, ...params: SqlValue[]) => raw.getFirstAsync<T>(sql, params),
  };

  const inner: SqlDb = { ...base, transaction: (fn) => fn(inner) };

  const db: SqlDb = {
    ...base,
    transaction: <T>(fn: (tx: SqlDb) => Promise<T>) => {
      const next = queue.then(async () => {
        await raw.execAsync('BEGIN');
        try {
          const result = await fn(inner);
          await raw.execAsync('COMMIT');
          return result;
        } catch (err) {
          await raw.execAsync('ROLLBACK');
          throw err;
        }
      });
      queue = next.catch(() => undefined);
      return next;
    },
  };
  return db;
}
