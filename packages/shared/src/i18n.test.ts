import { describe, expect, it } from 'vitest';
import { defaultLocale, locales, messages, t } from './i18n';

describe('i18n', () => {
  it('defaults to Portuguese', () => {
    expect(defaultLocale).toBe('pt');
    expect(t('appName')).toBe(messages.pt.appName);
  });

  it('has every key in every locale', () => {
    const keys = Object.keys(messages.pt).sort();
    for (const locale of locales) {
      expect(Object.keys(messages[locale]).sort()).toEqual(keys);
    }
  });
});
