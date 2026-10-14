import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { MessageKey } from '@estacionamento/shared';
import { formatUsd } from '@estacionamento/shared';
import { useApp } from './app-state';
import type { Env } from './env';
import { getVehicleClasses } from './local/reference';
import type { LocalVehicleClass } from './local/reference';
import { LocalError } from './local/tickets';
import type { Session } from './session';

/** The system clock, re-read every `everyMs` (BR-09: shown, never typed). */
export function useNow(everyMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/**
 * Loads data from the phone's database; reloads when the screen comes into view, after each
 * sync and after each local write. `key` lists the inputs the query depends on.
 */
export function useLocalData<T>(
  load: (env: Env, session: Session) => Promise<T>,
  key: readonly unknown[] = [],
): T | undefined {
  const { env, session, dataVersion } = useApp();
  const [data, setData] = useState<T>();
  const [focus, setFocus] = useState(0);
  useFocusEffect(useCallback(() => setFocus((f) => f + 1), []));
  const keyString = JSON.stringify(key);

  useEffect(() => {
    if (!env || !session) return;
    let live = true;
    void load(env, session).then((d) => live && setData(d));
    return () => {
      live = false;
    };
    // `load` is a fresh closure each render; `keyString` captures what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env, session, dataVersion, focus, keyString]);

  return data;
}

/** Vehicle classes with a name in the current language. */
export function useVehicleClasses(): (LocalVehicleClass & { name: string })[] {
  const { locale } = useApp();
  const classes = useLocalData((env) => getVehicleClasses(env.db)) ?? [];
  return classes.map((c) => ({ ...c, name: locale === 'tet' ? c.nameTet : c.namePt }));
}

/** Message for an error thrown by the phone's ticket logic. */
export function useErrorText() {
  const { t } = useApp();
  return (err: unknown): string => {
    if (err instanceof LocalError) {
      if (err.code === 'CHARGE_CHANGED' && err.quote) {
        return t('error.CHARGE_CHANGED', { amount: formatUsd(err.quote.amountCents) });
      }
      return t(`error.${err.code}` as MessageKey);
    }
    return err instanceof Error ? err.message : String(err);
  };
}
