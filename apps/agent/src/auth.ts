// Agent sign-in (FR-01–FR-03, FR-05, docs/SYNC.md §5).
// Online first; without signal, the last successful sign-in saved on this phone is used.
import { pinSchema } from '@estacionamento/shared';
import type { SessionUser } from '@estacionamento/shared';
import { ApiRequestError, NetworkError } from './api';
import type { Env } from './env';
import { enqueue } from './local/outbox';
import { getSettings } from './local/reference';
import { hashPin, verifyPin } from './pin';
import type { PinHash } from './pin';
import type { Session } from './session';

/** Used only until the first sync downloads pinMaxAttempts; same as the server's seeded default. */
const FALLBACK_PIN_MAX_ATTEMPTS = 5;

const KEYS = {
  deviceId: 'deviceId',
  session: 'session',
  offlineProfile: 'offlineProfile',
  deviceBlocked: 'deviceBlocked',
} as const;

/** The last successful online sign-in, for offline use. Kept in the secure store only. */
interface OfflineProfile {
  user: SessionUser;
  pin: PinHash;
  failedAttempts: number;
  locked: boolean;
}

export type SignInResult =
  | { ok: true; session: Session }
  | {
      ok: false;
      reason:
        | 'invalid_pin_format'
        | 'wrong_pin'
        | 'locked'
        | 'device_blocked'
        /** No signal and this agent never signed in online on this phone. */
        | 'no_offline_profile';
      remainingAttempts?: number;
    };

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  const raw = await env.store.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function getDeviceId(env: Env): Promise<string> {
  const existing = await env.store.get(KEYS.deviceId);
  if (existing) return existing;
  const id = env.newId();
  await env.store.set(KEYS.deviceId, id);
  return id;
}

export async function isDeviceBlocked(env: Env): Promise<boolean> {
  return (await env.store.get(KEYS.deviceBlocked)) === '1';
}

/** Name shown next to the agent number on the sign-in screen, if this phone knows the agent. */
export async function knownAgentName(env: Env, agentNumber: string): Promise<string | null> {
  const profile = await readJson<OfflineProfile>(env, KEYS.offlineProfile);
  return profile && profile.user.agentNumber === agentNumber.trim().toUpperCase()
    ? profile.user.name
    : null;
}

export async function restoreSession(env: Env): Promise<Session | null> {
  if (await isDeviceBlocked(env)) return null;
  return readJson<Session>(env, KEYS.session);
}

/** Sign out, keeping the offline profile and all local data (unsynced tickets stay in the outbox). */
export async function signOut(env: Env): Promise<void> {
  await env.store.delete(KEYS.session);
  env.api.token = null;
}

async function logOfflineSignIn(
  env: Env,
  userId: string,
  success: boolean,
  reason?: 'wrong_pin' | 'wrong_pin_locked' | 'account_locked',
) {
  const eventId = env.newId();
  await enqueue(env.db, {
    id: eventId,
    userId,
    createdAt: env.now(),
    item: {
      kind: 'SIGN_IN',
      eventId,
      at: env.now().toISOString(),
      success,
      ...(reason ? { reason } : {}),
    },
  });
}

export async function signIn(
  env: Env,
  agentNumberInput: string,
  pin: string,
): Promise<SignInResult> {
  const agentNumber = agentNumberInput.trim().toUpperCase();
  if (!pinSchema.safeParse(pin).success) return { ok: false, reason: 'invalid_pin_format' };
  if (await isDeviceBlocked(env)) return { ok: false, reason: 'device_blocked' };
  const deviceId = await getDeviceId(env);
  const profile = await readJson<OfflineProfile>(env, KEYS.offlineProfile);
  const sameAgent = profile?.user.agentNumber === agentNumber;

  try {
    const res = await env.api.agentLogin({ agentNumber, pin, deviceId });
    const session: Session = { user: res.user, deviceId, token: res.token, mode: 'online' };
    await env.store.set(KEYS.session, JSON.stringify(session));
    const fresh: OfflineProfile = {
      user: res.user,
      pin: hashPin(pin, env.randomBytes(16)),
      failedAttempts: 0,
      locked: false,
    };
    await env.store.set(KEYS.offlineProfile, JSON.stringify(fresh));
    env.api.token = res.token;
    return { ok: true, session };
  } catch (err) {
    if (err instanceof ApiRequestError) {
      // The server decides when it can be reached; keep the phone's copy in step with it.
      if (err.code === 'DEVICE_BLOCKED') {
        await env.store.set(KEYS.deviceBlocked, '1');
        return { ok: false, reason: 'device_blocked' };
      }
      if (err.code === 'ACCOUNT_LOCKED') {
        if (profile && sameAgent) await saveProfile(env, { ...profile, locked: true });
        return { ok: false, reason: 'locked' };
      }
      if (err.code === 'INVALID_CREDENTIALS') {
        const remaining = err.body.remainingAttempts;
        if (profile && sameAgent && remaining !== undefined) {
          const max = (await getSettings(env.db))?.pinMaxAttempts ?? FALLBACK_PIN_MAX_ATTEMPTS;
          await saveProfile(env, { ...profile, failedAttempts: Math.max(0, max - remaining) });
        }
        return {
          ok: false,
          reason: 'wrong_pin',
          ...(remaining === undefined ? {} : { remainingAttempts: remaining }),
        };
      }
      throw err;
    }
    if (!(err instanceof NetworkError)) throw err;
  }

  // ── Offline (FR-02) ──
  if (!profile || !sameAgent) return { ok: false, reason: 'no_offline_profile' };
  if (profile.locked) {
    await logOfflineSignIn(env, profile.user.id, false, 'account_locked');
    return { ok: false, reason: 'locked' };
  }

  if (!verifyPin(pin, profile.pin)) {
    const max = (await getSettings(env.db))?.pinMaxAttempts ?? FALLBACK_PIN_MAX_ATTEMPTS;
    const failedAttempts = profile.failedAttempts + 1;
    const locked = failedAttempts >= max;
    await saveProfile(env, { ...profile, failedAttempts, locked });
    await logOfflineSignIn(env, profile.user.id, false, locked ? 'wrong_pin_locked' : 'wrong_pin');
    return locked
      ? { ok: false, reason: 'locked' }
      : { ok: false, reason: 'wrong_pin', remainingAttempts: max - failedAttempts };
  }

  await saveProfile(env, { ...profile, failedAttempts: 0 });
  await logOfflineSignIn(env, profile.user.id, true);
  const previous = await readJson<Session>(env, KEYS.session);
  const session: Session = {
    user: profile.user,
    deviceId,
    // Keep the last token so sync can use it if it is still valid.
    token: previous?.user.id === profile.user.id ? previous.token : null,
    mode: 'offline',
  };
  await env.store.set(KEYS.session, JSON.stringify(session));
  return { ok: true, session };
}

async function saveProfile(env: Env, profile: OfflineProfile) {
  await env.store.set(KEYS.offlineProfile, JSON.stringify(profile));
}
