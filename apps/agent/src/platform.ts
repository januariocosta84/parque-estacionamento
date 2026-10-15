// The real phone environment: encrypted SQLite, expo-secure-store, system clock, secure random.
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { ApiClient } from './api';
import { openExpoDb } from './db/expo';
import { migrate } from './db/schema';
import type { Env, SecureStore as Store } from './env';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * API address, fixed at build time (README "Phone builds"). A release build without it would
 * quietly try the phone itself, so it fails at start-up instead.
 */
function apiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (url) return url;
  if (__DEV__) return 'http://localhost:3001';
  throw new Error('EXPO_PUBLIC_API_URL was not set when this app was built');
}

export async function createPhoneEnv(): Promise<Env> {
  const store: Store = {
    get: (key) => SecureStore.getItemAsync(key),
    set: (key, value) => SecureStore.setItemAsync(key, value),
    delete: (key) => SecureStore.deleteItemAsync(key),
  };

  // Database key generated once per install and kept in the Android Keystore / iOS Keychain.
  let dbKey = await store.get('dbKey');
  if (!dbKey) {
    dbKey = toHex(Crypto.getRandomBytes(32));
    await store.set('dbKey', dbKey);
  }
  const db = await openExpoDb('estacionamento.db', dbKey);
  await migrate(db);

  return {
    db,
    store,
    api: new ApiClient(apiUrl()),
    now: () => new Date(),
    newId: () => Crypto.randomUUID(),
    randomBytes: (n) => Crypto.getRandomBytes(n),
  };
}
