// Console session: the API token lives in an httpOnly cookie; the user and role always come
// from the API (GET /me), never from the browser (CLAUDE.md rule 8).
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { meResponseSchema } from '@estacionamento/shared';
import type { Role, SessionUser } from '@estacionamento/shared';
import { ApiError, api } from './api';

export const SESSION_COOKIE = 'session';
export const CHALLENGE_COOKIE = 'login_challenge';

export interface ConsoleSession {
  token: string;
  user: SessionUser;
}

/** The signed-in console user, or null. Cached for one request. */
export const getSession = cache(async (): Promise<ConsoleSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { user } = await api('/me', meResponseSchema, { token });
    if (user.role === 'agent') return null; // agents use the phone app
    return { token, user };
  } catch (err) {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) return null;
    throw err;
  }
});

/** Where each role starts. */
export function homeFor(role: Role): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'auditor':
      return '/audit';
    default:
      return '/monitor';
  }
}

/** Signed in with one of `roles`, or redirected (to sign-in, or to the user's own start page). */
export async function requireSession(roles?: Role[]): Promise<ConsoleSession> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (roles && !roles.includes(session.user.role)) redirect(homeFor(session.user.role));
  return session;
}
