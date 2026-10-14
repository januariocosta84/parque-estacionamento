// The real phone environment: encrypted SQLite, expo-secure-store, system clock, secure random.
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { ApiClient } from './api';
import { openExpoDb } from './db/expo';
import { migrate } from './db/schema';
import type { Env, SecureStore as Store } from './env';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

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
    api: new ApiClient(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'),
    now: () => new Date(),
    newId: () => Crypto.randomUUID(),
    randomBytes: (n) => Crypto.getRandomBytes(n),
  };
}
