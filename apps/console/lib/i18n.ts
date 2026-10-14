// Console language from a cookie (Português by default, NFR-05).
import 'server-only';
import { cookies } from 'next/headers';
import { defaultLocale, formatUsd, locales, messages, translate } from '@estacionamento/shared';
import type { Locale, MessageKey, MessageParams } from '@estacionamento/shared';
import { ApiError } from './api';

export const LOCALE_COOKIE = 'locale';

export type T = (key: MessageKey, params?: MessageParams) => string;

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return (locales as readonly string[]).includes(value ?? '') ? (value as Locale) : defaultLocale;
}

export async function getT(): Promise<{ t: T; locale: Locale }> {
  const locale = await getLocale();
  return { locale, t: (key, params) => translate(locale, key, params) };
}

/** A readable message for an error from the API. */
export function errorMessage(t: T, err: unknown): string {
  if (err instanceof ApiError) {
    const key = `error.${err.code}`;
    if (key in messages.pt) {
      const quote = err.body?.quote;
      return t(key as MessageKey, quote ? { amount: formatUsd(quote.amountCents) } : undefined);
    }
  }
  return t('error.INTERNAL');
}
