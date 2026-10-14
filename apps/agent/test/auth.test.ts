// Sign-in online and offline, with PIN lockout (FR-01–FR-03, FR-05).
import { describe, expect, it } from 'vitest';
import { knownAgentName, restoreSession, signIn, signOut } from '../src/auth';
import { queuedFor } from '../src/local/outbox';
import { hashPin, verifyPin } from '../src/pin';
import { agentUser, fakeApi, makeEnv } from './helpers';

const okLogin = {
  status: 200,
  json: { token: 'tok-'.padEnd(43, 'x'), expiresAt: '2026-10-14T00:00:00.000Z', user: agentUser },
};

/** A phone whose network can be switched off; the server accepts PIN 123456. */
async function phone() {
  let online = true;
  let serverAnswer: (pin: string) => { status: number; json: object } = (pin) =>
    pin === '123456'
      ? okLogin
      : {
          status: 401,
          json: { error: 'INVALID_CREDENTIALS', message: 'Wrong', remainingAttempts: 4 },
        };
  const { api, calls } = fakeApi((_m, path, body) => {
    if (!online) return 'offline';
    if (path === '/auth/agent/login') return serverAnswer((body as { pin: string }).pin);
    return { status: 404, json: { error: 'NOT_FOUND', message: path } };
  });
  const env = await makeEnv(api);
  return {
    env,
    calls,
    goOffline: () => (online = false),
    goOnline: () => (online = true),
    setServer: (fn: typeof serverAnswer) => (serverAnswer = fn),
  };
}

describe('PIN hash', () => {
  it('verifies the right PIN only', () => {
    const h = hashPin('123456', new Uint8Array(16).fill(7), 1000);
    expect(verifyPin('123456', h)).toBe(true);
    expect(verifyPin('123457', h)).toBe(false);
    expect(h.hash).not.toContain('123456');
  });
});

describe('online sign-in (FR-01)', () => {
  it('signs in, registers a stable device id, and remembers the agent for offline use', async () => {
    const p = await phone();
    const res = await signIn(p.env, ' amd-017 ', '123456');
    expect(res).toMatchObject({
      ok: true,
      session: { mode: 'online', user: { id: agentUser.id } },
    });

    const deviceId = p.calls[0]!.body as { deviceId: string; agentNumber: string };
    expect(deviceId.agentNumber).toBe('AMD-017');
    await signIn(p.env, 'AMD-017', '123456');
    expect((p.calls[1]!.body as { deviceId: string }).deviceId).toBe(deviceId.deviceId);

    expect(await knownAgentName(p.env, 'amd-017')).toBe('Agente Teste');
    expect(await restoreSession(p.env)).toMatchObject({ user: { id: agentUser.id } });
    // the PIN itself is never stored
    expect(
      [...(p.env.store as unknown as { data: Map<string, string> }).data.values()].join(),
    ).not.toContain('123456');
  });

  it('wrong PIN online shows the server’s remaining attempts', async () => {
    const p = await phone();
    expect(await signIn(p.env, 'AMD-017', '000000')).toEqual({
      ok: false,
      reason: 'wrong_pin',
      remainingAttempts: 4,
    });
  });

  it('rejects a PIN that is not 6 digits without calling the server', async () => {
    const p = await phone();
    expect(await signIn(p.env, 'AMD-017', '12345')).toEqual({
      ok: false,
      reason: 'invalid_pin_format',
    });
    expect(p.calls).toHaveLength(0);
  });
});

describe('offline sign-in (FR-02) and lockout (FR-03)', () => {
  it('without signal, signs in with the last successful sign-in and logs a SIGN_IN event', async () => {
    const p = await phone();
    await signIn(p.env, 'AMD-017', '123456');
    await signOut(p.env);
    p.goOffline();

    const res = await signIn(p.env, 'AMD-017', '123456');
    expect(res).toMatchObject({ ok: true, session: { mode: 'offline', token: null } });
    const [event] = await queuedFor(p.env.db, agentUser.id, 10);
    expect(event?.item).toMatchObject({ kind: 'SIGN_IN', success: true });
  });

  it('a different agent cannot sign in offline on this phone', async () => {
    const p = await phone();
    await signIn(p.env, 'AMD-017', '123456');
    p.goOffline();
    expect(await signIn(p.env, 'AMD-099', '123456')).toEqual({
      ok: false,
      reason: 'no_offline_profile',
    });
  });

  it('locks after 5 wrong PINs offline, even for the right PIN, until an online sign-in', async () => {
    const p = await phone();
    await signIn(p.env, 'AMD-017', '123456');
    p.goOffline();

    for (let i = 1; i <= 4; i++) {
      expect(await signIn(p.env, 'AMD-017', '000000')).toEqual({
        ok: false,
        reason: 'wrong_pin',
        remainingAttempts: 5 - i,
      });
    }
    expect(await signIn(p.env, 'AMD-017', '000000')).toEqual({ ok: false, reason: 'locked' });
    expect(await signIn(p.env, 'AMD-017', '123456')).toEqual({ ok: false, reason: 'locked' });

    const events = (await queuedFor(p.env.db, agentUser.id, 20)).map((r) => r.item);
    expect(events.filter((e) => e.kind === 'SIGN_IN' && !e.success)).toHaveLength(6);

    // Back online: the server (after a supervisor reset) accepts the new PIN and unlocks the phone.
    p.goOnline();
    expect((await signIn(p.env, 'AMD-017', '123456')).ok).toBe(true);
    p.goOffline();
    expect((await signIn(p.env, 'AMD-017', '123456')).ok).toBe(true);
  });

  it('server says locked: the phone also refuses offline', async () => {
    const p = await phone();
    await signIn(p.env, 'AMD-017', '123456');
    p.setServer(() => ({ status: 423, json: { error: 'ACCOUNT_LOCKED', message: 'Locked' } }));
    expect(await signIn(p.env, 'AMD-017', '123456')).toEqual({ ok: false, reason: 'locked' });
    p.goOffline();
    expect(await signIn(p.env, 'AMD-017', '123456')).toEqual({ ok: false, reason: 'locked' });
  });
});

describe('blocked phone (FR-05)', () => {
  it('refuses sign-in from then on, online or offline, but keeps the data', async () => {
    const p = await phone();
    await signIn(p.env, 'AMD-017', '123456');
    p.setServer(() => ({ status: 403, json: { error: 'DEVICE_BLOCKED', message: 'Blocked' } }));
    expect(await signIn(p.env, 'AMD-017', '123456')).toEqual({
      ok: false,
      reason: 'device_blocked',
    });
    p.goOffline();
    expect(await signIn(p.env, 'AMD-017', '123456')).toEqual({
      ok: false,
      reason: 'device_blocked',
    });
    expect(await restoreSession(p.env)).toBeNull();
    expect(await p.env.store.get('offlineProfile')).not.toBeNull();
  });
});
