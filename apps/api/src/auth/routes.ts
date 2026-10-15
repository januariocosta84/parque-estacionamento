import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  agentLoginRequestSchema,
  consoleLoginRequestSchema,
  consoleVerifyRequestSchema,
  resetPinRequestSchema,
  translate,
  userIdParamsSchema,
} from '@estacionamento/shared';
import type {
  ConsoleLoginResponse,
  MeResponse,
  SessionResponse,
  SessionUser,
} from '@estacionamento/shared';
import type { Db } from '../db';
import { writeEvent } from '../events';
import { ApiError, parse } from '../http';
import { getSetting } from '../settings';
import type { SmsSender } from '../sms';
import { ALL_ROLES, authOf, requireRole } from './guard';
import {
  DUMMY_HASH,
  hashSecret,
  newLoginCode,
  newSessionToken,
  sha256,
  verifySecret,
} from './secrets';

const HOUR_MS = 60 * 60_000;

/**
 * Sign-in rate limit, counted per client IP *and* account: many agents' phones can share one
 * carrier IP (CGNAT), so an IP-only limit would lock out a whole shift.
 */
function signInLimit(
  max: number,
  minutes: number,
  field: 'agentNumber' | 'username' | 'challengeId',
) {
  return {
    config: {
      rateLimit: {
        max,
        timeWindow: minutes * 60_000,
        hook: 'preHandler' as const,
        keyGenerator: (request: FastifyRequest) => {
          const body = (request.body ?? {}) as Record<string, unknown>;
          return `${request.ip}|${field}|${String(body[field] ?? '')
            .trim()
            .toUpperCase()}`;
        },
      },
    },
  };
}

function toSessionUser(user: {
  id: string;
  name: string;
  agentNumber: string | null;
  username: string | null;
  role: SessionUser['role'];
  status: SessionUser['status'];
  areas: { areaId: string }[];
}): SessionUser {
  return {
    id: user.id,
    name: user.name,
    agentNumber: user.agentNumber,
    username: user.username,
    role: user.role,
    status: user.status,
    areaIds: user.areas.map((a) => a.areaId),
  };
}

export function registerAuthRoutes(app: FastifyInstance, db: Db, sms: SmsSender) {
  // ── Agent: agent number + 6-digit PIN (FR-01, FR-03, FR-05) ──────────────
  app.post(
    '/auth/agent/login',
    signInLimit(10, 1, 'agentNumber'),
    async (request): Promise<SessionResponse> => {
      const body = parse(agentLoginRequestSchema, request.body);
      const user = await db.user.findUnique({
        where: { agentNumber: body.agentNumber },
        include: { areas: true },
      });

      if (!user || user.role !== 'agent' || !user.pinHash) {
        await verifySecret(body.pin, DUMMY_HASH); // same timing as a real check
        throw new ApiError('INVALID_CREDENTIALS', 'Wrong agent number or PIN');
      }

      const failed = (reason: string, extra: Record<string, number> = {}) =>
        writeEvent(db, {
          type: 'SIGN_IN',
          userId: user.id,
          details: { success: false, reason, deviceId: body.deviceId, ...extra },
        });

      if (user.status === 'LOCKED') {
        await failed('account_locked');
        throw new ApiError('ACCOUNT_LOCKED', 'Account locked; a supervisor must reset the PIN');
      }

      const device = await db.device.findUnique({ where: { id: body.deviceId } });
      if (device?.status === 'BLOCKED') {
        await failed('device_blocked');
        throw new ApiError('DEVICE_BLOCKED', 'This device is blocked');
      }

      if (!(await verifySecret(body.pin, user.pinHash))) {
        const maxAttempts = await getSetting(db, 'pinMaxAttempts');
        const { failedPinAttempts } = await db.user.update({
          where: { id: user.id },
          data: { failedPinAttempts: { increment: 1 } },
        });
        const locked = failedPinAttempts >= maxAttempts;
        if (locked) {
          await db.user.update({ where: { id: user.id }, data: { status: 'LOCKED' } });
        }
        await failed(locked ? 'wrong_pin_locked' : 'wrong_pin', { attempt: failedPinAttempts });
        if (locked) {
          throw new ApiError('ACCOUNT_LOCKED', 'Too many wrong PINs; a supervisor must reset it');
        }
        throw new ApiError('INVALID_CREDENTIALS', 'Wrong agent number or PIN', {
          remainingAttempts: maxAttempts - failedPinAttempts,
        });
      }

      const hours = await getSetting(db, 'agentSessionHours');
      const token = newSessionToken();
      const expiresAt = new Date(Date.now() + hours * HOUR_MS);

      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { failedPinAttempts: 0 } });
        await tx.device.upsert({
          where: { id: body.deviceId },
          create: { id: body.deviceId, userId: user.id },
          update: { userId: user.id },
        });
        await tx.session.create({
          data: { tokenHash: sha256(token), userId: user.id, deviceId: body.deviceId, expiresAt },
        });
        await writeEvent(tx, {
          type: 'SIGN_IN',
          userId: user.id,
          deviceId: body.deviceId,
          details: { success: true, method: 'pin' },
        });
      });

      return { token, expiresAt: expiresAt.toISOString(), user: toSessionUser(user) };
    },
  );

  // ── Console step 1: username + password, then an SMS code is sent (FR-04) ─
  app.post(
    '/auth/console/login',
    signInLimit(10, 15, 'username'),
    async (request): Promise<ConsoleLoginResponse> => {
      const body = parse(consoleLoginRequestSchema, request.body);
      const user = await db.user.findUnique({ where: { username: body.username } });

      if (!user || user.role === 'agent' || !user.passwordHash) {
        await verifySecret(body.password, DUMMY_HASH);
        throw new ApiError('INVALID_CREDENTIALS', 'Wrong username or password');
      }
      if (user.status === 'LOCKED') {
        await writeEvent(db, {
          type: 'SIGN_IN',
          userId: user.id,
          details: { success: false, reason: 'account_locked' },
        });
        throw new ApiError('ACCOUNT_LOCKED', 'Account is locked');
      }
      if (!(await verifySecret(body.password, user.passwordHash))) {
        await writeEvent(db, {
          type: 'SIGN_IN',
          userId: user.id,
          details: { success: false, reason: 'wrong_password' },
        });
        throw new ApiError('INVALID_CREDENTIALS', 'Wrong username or password');
      }

      const minutes = await getSetting(db, 'loginCodeTtlMinutes');
      const code = newLoginCode();
      const expiresAt = new Date(Date.now() + minutes * 60_000);
      const challenge = await db.loginCode.create({
        data: { userId: user.id, codeHash: await hashSecret(code), expiresAt },
      });
      await sms.send(user.phone, translate('pt', 'sms.loginCode', { code, minutes }));

      return { challengeId: challenge.id, expiresAt: expiresAt.toISOString() };
    },
  );

  // ── Console step 2: one-time code ────────────────────────────────────────
  app.post(
    '/auth/console/verify',
    signInLimit(10, 15, 'challengeId'),
    async (request): Promise<SessionResponse> => {
      const body = parse(consoleVerifyRequestSchema, request.body);
      const challenge = await db.loginCode.findUnique({
        where: { id: body.challengeId },
        include: { user: { include: { areas: true } } },
      });
      const maxAttempts = await getSetting(db, 'loginCodeMaxAttempts');

      if (
        !challenge ||
        challenge.usedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= maxAttempts ||
        challenge.user.status === 'LOCKED'
      ) {
        throw new ApiError('CODE_EXPIRED', 'Code expired or already used; sign in again');
      }

      if (!(await verifySecret(body.code, challenge.codeHash))) {
        await db.loginCode.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
        await writeEvent(db, {
          type: 'SIGN_IN',
          userId: challenge.userId,
          details: { success: false, reason: 'wrong_code' },
        });
        throw new ApiError('INVALID_CREDENTIALS', 'Wrong code');
      }

      const hours = await getSetting(db, 'consoleSessionHours');
      const token = newSessionToken();
      const expiresAt = new Date(Date.now() + hours * HOUR_MS);

      await db.$transaction(async (tx) => {
        // usedAt: null in the filter makes the code single-use even under concurrent requests
        const { count } = await tx.loginCode.updateMany({
          where: { id: challenge.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (count !== 1) throw new ApiError('CODE_EXPIRED', 'Code already used; sign in again');
        await tx.session.create({
          data: { tokenHash: sha256(token), userId: challenge.userId, expiresAt },
        });
        await writeEvent(tx, {
          type: 'SIGN_IN',
          userId: challenge.userId,
          details: { success: true, method: 'password+sms' },
        });
      });

      return { token, expiresAt: expiresAt.toISOString(), user: toSessionUser(challenge.user) };
    },
  );

  // ── Session ──────────────────────────────────────────────────────────────
  app.get(
    '/me',
    { preHandler: requireRole(db, ...ALL_ROLES) },
    async (request): Promise<MeResponse> => {
      const { user } = authOf(request);
      return { user };
    },
  );

  app.post(
    '/auth/logout',
    { preHandler: requireRole(db, ...ALL_ROLES) },
    async (request, reply) => {
      await db.session.update({
        where: { id: authOf(request).sessionId },
        data: { revokedAt: new Date() },
      });
      return reply.status(204).send();
    },
  );

  // ── Supervisor unlocks an agent with a new PIN (FR-03) ───────────────────
  app.post(
    '/users/:id/reset-pin',
    { preHandler: requireRole(db, 'supervisor', 'admin') },
    async (request, reply) => {
      const actor = authOf(request).user;
      const { id } = parse(userIdParamsSchema, request.params);
      const body = parse(resetPinRequestSchema, request.body);

      const target = await db.user.findUnique({ where: { id }, include: { areas: true } });
      if (!target || target.role !== 'agent') throw new ApiError('NOT_FOUND', 'Agent not found');
      if (
        actor.role === 'supervisor' &&
        !target.areas.some((a) => actor.areaIds.includes(a.areaId))
      ) {
        throw new ApiError('FORBIDDEN', 'Agent is not in one of your areas');
      }

      const pinHash = await hashSecret(body.pin);
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: { pinHash, status: 'ACTIVE', failedPinAttempts: 0 },
        });
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await writeEvent(tx, {
          type: 'ADMIN_CHANGE',
          userId: actor.id,
          details: {
            action: 'reset_pin',
            targetUserId: id,
            wasLocked: target.status === 'LOCKED',
            reason: body.reason,
          },
        });
      });
      return reply.status(204).send();
    },
  );
}
