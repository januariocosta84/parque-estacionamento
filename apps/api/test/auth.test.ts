import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  consoleLoginResponseSchema,
  errorResponseSchema,
  meResponseSchema,
  sessionResponseSchema,
} from '@estacionamento/shared';
import { buildApp } from '../src/app';
import type { Db } from '../src/db';
import { MemorySmsSender } from '../src/sms';
import {
  createAgent,
  createConsoleUser,
  hasTestDb,
  newDeviceId,
  seedTestDb,
  testDb,
} from './helpers';

describe.skipIf(!hasTestDb)('auth and role guard', () => {
  let db: Db;
  let sms: MemorySmsSender;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    db = testDb();
    await seedTestDb(db);
    sms = new MemorySmsSender();
    app = buildApp({ db, sms });
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  const agentLogin = (agentNumber: string, pin: string, deviceId = newDeviceId()) =>
    app.inject({
      method: 'POST',
      url: '/auth/agent/login',
      payload: { agentNumber, pin, deviceId },
    });

  async function consoleSignIn(username: string, password = 'console-password') {
    const step1 = await app.inject({
      method: 'POST',
      url: '/auth/console/login',
      payload: { username, password },
    });
    expect(step1.statusCode).toBe(200);
    const { challengeId } = consoleLoginResponseSchema.parse(step1.json());
    const code = sms.sent.at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeDefined();
    const step2 = await app.inject({
      method: 'POST',
      url: '/auth/console/verify',
      payload: { challengeId, code },
    });
    return { step2, challengeId, code: code! };
  }

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  describe('agent sign-in (FR-01)', () => {
    it('signs in with agent number and PIN, registers the device, logs SIGN_IN', async () => {
      const agent = await createAgent(db);
      const deviceId = newDeviceId();
      const res = await agentLogin(agent.agentNumber!.toLowerCase(), '123456', deviceId);

      expect(res.statusCode).toBe(200);
      const body = sessionResponseSchema.parse(res.json());
      expect(body.user).toMatchObject({ id: agent.id, role: 'agent' });
      expect(body.user.areaIds).toHaveLength(1);
      expect(JSON.stringify(res.json())).not.toMatch(/hash/i);

      expect(await db.device.findUnique({ where: { id: deviceId } })).toMatchObject({
        userId: agent.id,
        status: 'ACTIVE',
      });
      const event = await db.event.findFirst({
        where: { userId: agent.id, type: 'SIGN_IN' },
        orderBy: { receivedAt: 'desc' },
      });
      expect(event).toMatchObject({ deviceId, details: { success: true, method: 'pin' } });

      const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(body.token) });
      expect(meResponseSchema.parse(me.json()).user.id).toBe(agent.id);
    });

    it('rejects an unknown agent number and a malformed PIN', async () => {
      expect((await agentLogin('NOPE-1', '123456')).statusCode).toBe(401);
      expect((await agentLogin('NOPE-1', '12345')).statusCode).toBe(400);
    });
  });

  describe('PIN lockout (FR-03)', () => {
    it('counts down, locks after 5 wrong PINs, then refuses even the right PIN', async () => {
      const agent = await createAgent(db);
      for (let i = 1; i <= 4; i++) {
        const res = await agentLogin(agent.agentNumber!, '000000');
        expect(res.statusCode).toBe(401);
        expect(errorResponseSchema.parse(res.json()).remainingAttempts).toBe(5 - i);
      }
      const fifth = await agentLogin(agent.agentNumber!, '000000');
      expect(fifth.statusCode).toBe(423);
      expect(fifth.json().error).toBe('ACCOUNT_LOCKED');

      expect((await agentLogin(agent.agentNumber!, '123456')).statusCode).toBe(423);
      expect((await db.user.findUniqueOrThrow({ where: { id: agent.id } })).status).toBe('LOCKED');

      const failures = await db.event.count({
        where: { userId: agent.id, type: 'SIGN_IN', details: { path: ['success'], equals: false } },
      });
      expect(failures).toBe(6);
    });

    it('a correct PIN resets the wrong-PIN count', async () => {
      const agent = await createAgent(db);
      await agentLogin(agent.agentNumber!, '000000');
      await agentLogin(agent.agentNumber!, '123456');
      expect((await db.user.findUniqueOrThrow({ where: { id: agent.id } })).failedPinAttempts).toBe(
        0,
      );
    });

    it('a supervisor of the same area unlocks the agent with a new PIN; old sessions end', async () => {
      const agent = await createAgent(db);
      const oldSession = sessionResponseSchema.parse(
        (await agentLogin(agent.agentNumber!, '123456')).json(),
      );
      for (let i = 0; i < 5; i++) await agentLogin(agent.agentNumber!, '000000');

      const supervisor = await createConsoleUser(db, 'supervisor');
      const { token } = sessionResponseSchema.parse(
        (await consoleSignIn(supervisor.username!)).step2.json(),
      );

      const reset = await app.inject({
        method: 'POST',
        url: `/users/${agent.id}/reset-pin`,
        headers: bearer(token),
        payload: { pin: '654321', reason: 'Agent forgot PIN' },
      });
      expect(reset.statusCode).toBe(204);

      expect((await agentLogin(agent.agentNumber!, '654321')).statusCode).toBe(200);
      const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(oldSession.token) });
      expect(me.statusCode).toBe(401);

      const event = await db.event.findFirst({
        where: { userId: supervisor.id, type: 'ADMIN_CHANGE' },
      });
      expect(event?.details).toMatchObject({
        action: 'reset_pin',
        targetUserId: agent.id,
        wasLocked: true,
        reason: 'Agent forgot PIN',
      });
    });

    it('a supervisor of another area may not reset the PIN', async () => {
      const agent = await createAgent(db, { areaName: 'Setor B' });
      const supervisor = await createConsoleUser(db, 'supervisor', { areaName: 'Setor A' });
      const { token } = sessionResponseSchema.parse(
        (await consoleSignIn(supervisor.username!)).step2.json(),
      );
      const res = await app.inject({
        method: 'POST',
        url: `/users/${agent.id}/reset-pin`,
        headers: bearer(token),
        payload: { pin: '654321', reason: 'x' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('blocked device (FR-05)', () => {
    it('refuses sign-in and ends existing sessions from a blocked phone', async () => {
      const agent = await createAgent(db);
      const deviceId = newDeviceId();
      const { token } = sessionResponseSchema.parse(
        (await agentLogin(agent.agentNumber!, '123456', deviceId)).json(),
      );
      await db.device.update({ where: { id: deviceId }, data: { status: 'BLOCKED' } });

      const again = await agentLogin(agent.agentNumber!, '123456', deviceId);
      expect(again.statusCode).toBe(403);
      expect(again.json().error).toBe('DEVICE_BLOCKED');
      const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
      expect(me.statusCode).toBe(403);
    });
  });

  describe('console sign-in: password + SMS code (FR-04)', () => {
    it('sends a code by SMS (stub) and signs in with it, once', async () => {
      const finance = await createConsoleUser(db, 'finance');
      const { step2, challengeId, code } = await consoleSignIn(finance.username!);
      expect(step2.statusCode).toBe(200);
      expect(sessionResponseSchema.parse(step2.json()).user.role).toBe('finance');
      expect(sms.sent.at(-1)?.to).toBe('+67000000001');

      const reuse = await app.inject({
        method: 'POST',
        url: '/auth/console/verify',
        payload: { challengeId, code },
      });
      expect(reuse.statusCode).toBe(401);
      expect(reuse.json().error).toBe('CODE_EXPIRED');
    });

    it('rejects a wrong password and gives up on a code after too many wrong tries', async () => {
      const auditor = await createConsoleUser(db, 'auditor');
      const wrong = await app.inject({
        method: 'POST',
        url: '/auth/console/login',
        payload: { username: auditor.username, password: 'nope' },
      });
      expect(wrong.statusCode).toBe(401);

      const step1 = await app.inject({
        method: 'POST',
        url: '/auth/console/login',
        payload: { username: auditor.username, password: 'console-password' },
      });
      const { challengeId } = consoleLoginResponseSchema.parse(step1.json());
      const realCode = sms.sent.at(-1)!.text.match(/\b(\d{6})\b/)![1]!;
      const badCode = realCode === '000000' ? '000001' : '000000';
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/console/verify',
          payload: { challengeId, code: badCode },
        });
        expect(res.statusCode).toBe(401);
      }
      const late = await app.inject({
        method: 'POST',
        url: '/auth/console/verify',
        payload: { challengeId, code: realCode },
      });
      expect(late.json().error).toBe('CODE_EXPIRED');
    });

    it('agents cannot use the console sign-in', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/console/login',
        payload: { username: 'anything', password: 'x' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('role guard (rule 8)', () => {
    it('401 without a token or with a bad one', async () => {
      expect((await app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: 'GET', url: '/me', headers: bearer('x'.repeat(43)) }))
          .statusCode,
      ).toBe(401);
    });

    it('403 when the role is not allowed (agent, finance, auditor cannot reset PINs)', async () => {
      const target = await createAgent(db);
      const agent = await createAgent(db);
      const agentToken = sessionResponseSchema.parse(
        (await agentLogin(agent.agentNumber!, '123456')).json(),
      ).token;
      const finance = await createConsoleUser(db, 'finance');
      const financeToken = sessionResponseSchema.parse(
        (await consoleSignIn(finance.username!)).step2.json(),
      ).token;

      for (const token of [agentToken, financeToken]) {
        const res = await app.inject({
          method: 'POST',
          url: `/users/${target.id}/reset-pin`,
          headers: bearer(token),
          payload: { pin: '111111', reason: 'x' },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('FORBIDDEN');
      }
    });

    it('logout ends the session', async () => {
      const agent = await createAgent(db);
      const { token } = sessionResponseSchema.parse(
        (await agentLogin(agent.agentNumber!, '123456')).json(),
      );
      const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: bearer(token) });
      expect(out.statusCode).toBe(204);
      expect(
        (await app.inject({ method: 'GET', url: '/me', headers: bearer(token) })).statusCode,
      ).toBe(401);
    });
  });
});
