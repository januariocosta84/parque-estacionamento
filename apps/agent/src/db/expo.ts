// expo-sqlite implementation of SqlDb. The database is encrypted with SQLCipher (NFR-06) using a
// random key kept in the phone's secure store.
import * as SQLite from 'expo-sqlite';
import { serialDb } from './serial';
import type { SqlDb } from './types';

export async function openExpoDb(name: string, hexKey: string): Promise<SqlDb> {
  const db = await SQLite.openDatabaseAsync(name);
  // SQLCipher key; ignored by plain SQLite builds such as Expo Go. It applies to this connection
  // only, which is why all access, transactions included, stays on it (serial.ts).
  await db.execAsync(`PRAGMA key = "x'${hexKey}'"`);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return serialDb(db);
}
