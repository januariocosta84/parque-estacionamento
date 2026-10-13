// User-facing strings. Portuguese is the default locale (NFR-05).
// M0 holds only proper names; the full pt/tet catalogue is added in M1.

export const locales = ['pt', 'tet'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'pt';

const pt = {
  appName: 'Estacionamento Dili',
  authorityName: 'Autoridade Municipal de Dili',
} as const;

export type MessageKey = keyof typeof pt;

export const messages: Record<Locale, Record<MessageKey, string>> = {
  pt,
  tet: {
    appName: 'Estacionamento Dili',
    authorityName: 'Autoridade Municipal de Dili',
  },
};

export function t(key: MessageKey, locale: Locale = defaultLocale): string {
  return messages[locale][key];
}
