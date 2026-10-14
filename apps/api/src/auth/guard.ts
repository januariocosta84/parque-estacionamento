// Every request is authenticated and role-checked on the server (CLAUDE.md rule 8, NFR-06).
// The role always comes from the database, never from the client.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@estacionamento/shared';
import type { Db } from '../db';
import { ApiError } from '../http';
import { sha256 } from './secrets';

export interface AuthContext {
  sessionId: string;
  deviceId: string | null;
  user: {
    id: string;
    name: string;
    agentNumber: string | null;
    username: string | null;
    role: Role;
    status: 'ACTIVE' | 'LOCKED';
    areaIds: string[];
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export async function loadAuth(db: Db, authorization: string | undefined): Promise<AuthContext> {
  const token = authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new ApiError('UNAUTHENTICATED', 'Sign in required');

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { areas: true } }, device: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw new ApiError('UNAUTHENTICATED', 'Session expired or signed out');
  }
  if (session.user.status === 'LOCKED') {
    throw new ApiError('ACCOUNT_LOCKED', 'Account is locked');
  }
  if (session.device?.status === 'BLOCKED') {
    throw new ApiError('DEVICE_BLOCKED', 'This device is blocked');
  }

  const { user } = session;
  return {
    sessionId: session.id,
    deviceId: session.deviceId,
    user: {
      id: user.id,
      name: user.name,
      agentNumber: user.agentNumber,
      username: user.username,
      role: user.role,
      status: user.status,
      areaIds: user.areas.map((a) => a.areaId),
    },
  };
}

/** preHandler: signed in with one of `roles`. */
export function requireRole(db: Db, ...roles: Role[]) {
  if (roles.length === 0) throw new Error('requireRole needs at least one role');
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const auth = await loadAuth(db, request.headers.authorization);
    if (!roles.includes(auth.user.role)) {
      throw new ApiError('FORBIDDEN', 'Your role may not do this');
    }
    request.auth = auth;
  };
}

/** The auth context set by requireRole; throws if a route forgot the guard. */
export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new Error('Route is missing requireRole()');
  return request.auth;
}

export const ALL_ROLES: Role[] = ['agent', 'supervisor', 'finance', 'auditor', 'admin'];
export const CONSOLE_ROLES: Role[] = ['supervisor', 'finance', 'auditor', 'admin'];
