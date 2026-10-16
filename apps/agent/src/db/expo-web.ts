// Browser-preview SqlDb: the same single-connection queue as the phone (serial.ts), no key.
import * as SQLite from 'expo-sqlite';
import { serialDb } from './serial';
import type { SqlDb } from './types';

export async function openWebDb(name: string): Promise<SqlDb> {
  return serialDb(await SQLite.openDatabaseAsync(name));
}
