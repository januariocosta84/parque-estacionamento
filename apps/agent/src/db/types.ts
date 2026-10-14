// The small slice of SQLite the app uses. Implemented by expo-sqlite on the phone (expo.ts)
// and by node:sqlite in tests, so the offline logic is tested without a device.

export type SqlValue = string | number | null;

export interface SqlDb {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  /** Runs `fn` in one exclusive transaction; rolls back if it throws. */
  transaction<T>(fn: (tx: SqlDb) => Promise<T>): Promise<T>;
}
