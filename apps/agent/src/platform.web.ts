// Browser preview only (expo start --web), for demos and screenshots. Phones use platform.ts.
// The browser has no secure store, so this uses localStorage: never use the web build for real data.
import * as Crypto from 'expo-crypto';
import { ApiClient } from './api';
import { openWebDb } from './db/expo-web';
import { migrate } from './db/schema';
import type { Env, SecureStore } from './env';

export async function createPhoneEnv(): Promise<Env> {
  const store: SecureStore = {
    get: async (key) => localStorage.getItem(`estacionamento.${key}`),
    set: async (key, value) => localStorage.setItem(`estacionamento.${key}`, value),
    delete: async (key) => localStorage.removeItem(`estacionamento.${key}`),
  };
  const db = await openWebDb('estacionamento-preview.db');
  await migrate(db);

  return {
    db,
    store,
    api: new ApiClient(process.env.EXPO_PUBLIC_WEB_API_URL ?? 'http://localhost:3001'),
    now: () => new Date(),
    newId: () => Crypto.randomUUID(),
    randomBytes: (n) => Crypto.getRandomBytes(n),
  };
}
