'use server';
// Console sign-in in two steps (FR-04): password, then the one-time SMS code.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { consoleLoginResponseSchema, locales, sessionResponseSchema } from '@estacionamento/shared';
import { z } from 'zod';
import { ApiError, api } from '../../lib/api';
import { LOCALE_COOKIE, errorMessage, getT } from '../../lib/i18n';
import { CHALLENGE_COOKIE, SESSION_COOKIE, getSession, homeFor } from '../../lib/session';

export interface LoginState {
  step: 'password' | 'code';
  username?: string;
  error?: string;
}

const secure = process.env.NODE_ENV === 'production';

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const { t } = await getT();
  const jar = await cookies();
  const username = String(formData.get('username') ?? '').trim();

  if (formData.get('step') === 'password') {
    try {
      const res = await api('/auth/console/login', consoleLoginResponseSchema, {
        method: 'POST',
        body: { username, password: String(formData.get('password') ?? '') },
      });
      jar.set(CHALLENGE_COOKIE, res.challengeId, {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        expires: new Date(res.expiresAt),
      });
      return { step: 'code', username };
    } catch (err) {
      return { step: 'password', username, error: errorMessage(t, err) };
    }
  }

  const challengeId = jar.get(CHALLENGE_COOKIE)?.value;
  if (!challengeId) return { step: 'password', username, error: t('error.CODE_EXPIRED') };
  let role;
  try {
    const session = await api('/auth/console/verify', sessionResponseSchema, {
      method: 'POST',
      body: { challengeId, code: String(formData.get('code') ?? '') },
    });
    jar.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      expires: new Date(session.expiresAt),
    });
    jar.delete(CHALLENGE_COOKIE);
    role = session.user.role;
  } catch (err) {
    const expired = err instanceof ApiError && err.code === 'CODE_EXPIRED';
    if (expired) jar.delete(CHALLENGE_COOKIE);
    return { step: expired ? 'password' : 'code', username, error: errorMessage(t, err) };
  }
  redirect(homeFor(role));
}

export async function setLocaleAction(formData: FormData) {
  const locale = z.enum(locales).safeParse(formData.get('locale'));
  if (locale.success) {
    (await cookies()).set(LOCALE_COOKIE, locale.data, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }
}

export async function logoutAction() {
  const session = await getSession();
  if (session) {
    try {
      await api('/auth/logout', z.any(), { method: 'POST', token: session.token });
    } catch {
      // the session may already be gone; clear the cookie anyway
    }
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
