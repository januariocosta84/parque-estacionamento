import { describe, expect, it } from 'vitest';
import { defaultLocale, formatHours, locales, messages, t, translate } from './i18n';
import type { MessageKey } from './i18n';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
  it('defaults to Portuguese', () => {
    expect(defaultLocale).toBe('pt');
    expect(t('appName')).toBe(messages.pt.appName);
  });

  it('has every key in every locale, with no empty strings', () => {
    const keys = Object.keys(messages.pt).sort();
    for (const locale of locales) {
      expect(Object.keys(messages[locale]).sort()).toEqual(keys);
      for (const value of Object.values(messages[locale])) expect(value.trim()).not.toBe('');
    }
  });

  it('uses the same placeholders in every locale', () => {
    for (const key of Object.keys(messages.pt) as MessageKey[]) {
      for (const locale of locales) {
        expect(placeholders(messages[locale][key]), `${locale}:${key}`).toEqual(
          placeholders(messages.pt[key]),
        );
      }
    }
  });

  it('fills placeholders', () => {
    expect(t('issued.registeredAt', { time: '09:20' })).toBe('Emissão registada às 09:20');
    expect(translate('tet', 'home.seeAll', { count: 12 })).toBe('Haree hotu · 12');
  });

  it('leaves unknown placeholders visible rather than blank', () => {
    expect(t('home.seeAll')).toBe('Ver todos · {count}');
  });

  it('formats hours with the right plural', () => {
    expect(formatHours('pt', 1)).toBe('1 hora');
    expect(formatHours('pt', 2)).toBe('2 horas');
  });
});
