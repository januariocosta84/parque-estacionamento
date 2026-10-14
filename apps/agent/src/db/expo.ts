// expo-sqlite implementation of SqlDb. The database is encrypted with SQLCipher (NFR-06) using a
// random key kept in the phone's secure store.
import * as SQLite from 'expo-sqlite';
import type { SqlDb, SqlValue } from './types';

function wrap(db: SQLite.SQLiteDatabase, inTransaction: boolean): SqlDb {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, ...params: SqlValue[]) => ({
      changes: (await db.runAsync(sql, params)).changes,
    }),
    all: (sql, ...params: SqlValue[]) => db.getAllAsync(sql, params),
    first: (sql, ...params: SqlValue[]) => db.getFirstAsync(sql, params),
    transaction: async <T>(fn: (tx: SqlDb) => Promise<T>) => {
      if (inTransaction) return fn(wrap(db, true));
      let result: T;
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(wrap(txn, true));
      });
      return result!;
    },
  };
}

export async function openExpoDb(name: string, hexKey: string): Promise<SqlDb> {
  const db = await SQLite.openDatabaseAsync(name);
  // SQLCipher key; ignored by plain SQLite builds such as Expo Go.
  await db.execAsync(`PRAGMA key = "x'${hexKey}'"`);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return wrap(db, false);
}
