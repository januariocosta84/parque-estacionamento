// Everything the offline logic needs from the outside world, injected so tests can fake it.
import type { ApiClient } from './api';
import type { SqlDb } from './db/types';

/** Key-value secure storage (expo-secure-store on the phone). */
export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  db: SqlDb;
  store: SecureStore;
  api: ApiClient;
  /** System clock (BR-09). */
  now(): Date;
  newId(): string;
  randomBytes(length: number): Uint8Array;
}
