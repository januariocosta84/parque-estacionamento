// App-wide state: environment, session, language and background sync (docs/SYNC.md §6).
import NetInfo from '@react-native-community/netinfo';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { defaultLocale, locales, translate } from '@estacionamento/shared';
import type { Locale, MessageKey, MessageParams } from '@estacionamento/shared';
import {
  isDeviceBlocked,
  restoreSession,
  signIn as authSignIn,
  signOut as authSignOut,
} from './auth';
import type { SignInResult } from './auth';
import type { Env } from './env';
import { countQueued, rejectedFor } from './local/outbox';
import { getMeta } from './local/reference';
import { createPhoneEnv } from './platform';
import type { Session } from './session';
import { SyncRunner } from './sync';
import type { SyncState } from './sync';

const SYNC_EVERY_MS = 2 * 60_000;

export interface SyncStatus {
  state: SyncState | 'idle';
  lastSyncAt: string | null;
  queued: number;
  rejected: number;
}

interface AppContextValue {
  status: 'loading' | 'signed-out' | 'signed-in' | 'blocked' | 'error';
  /** Why start-up failed (status 'error'), shown so it can be reported. */
  startError: string | null;
  retryStart(): void;
  env: Env | null;
  session: Session | null;
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: MessageKey, params?: MessageParams): string;
  signIn(agentNumber: string, pin: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  sync: SyncStatus;
  syncNow(): Promise<void>;
  /** Changes whenever local data may have changed; screens reload when it does. */
  dataVersion: number;
  /** Call after writing a ticket: refreshes screens and starts a sync in the background. */
  afterWrite(): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}

async function openApp(): Promise<{
  env: Env;
  locale: Locale | null;
  blocked: boolean;
  session: Session | null;
}> {
  const env = await createPhoneEnv();
  const saved = await env.store.get('locale');
  const locale = saved && (locales as readonly string[]).includes(saved) ? (saved as Locale) : null;
  if (await isDeviceBlocked(env)) return { env, locale, blocked: true, session: null };
  return { env, locale, blocked: false, session: await restoreSession(env) };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [env, setEnv] = useState<Env | null>(null);
  const [status, setStatus] = useState<AppContextValue['status']>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [sync, setSync] = useState<SyncStatus>({
    state: 'idle',
    lastSyncAt: null,
    queued: 0,
    rejected: 0,
  });
  const runner = useRef<SyncRunner | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const [startError, setStartError] = useState<string | null>(null);

  // Open the encrypted database and restore the session. A failure shows an error screen with a
  // retry instead of an endless spinner. State changes only once opening has finished.
  const start = useCallback(() => {
    void openApp().then(
      (o) => {
        runner.current = new SyncRunner(o.env);
        if (o.locale) setLocaleState(o.locale);
        setEnv(o.env);
        setSession(o.session);
        setStatus(o.blocked ? 'blocked' : o.session ? 'signed-in' : 'signed-out');
      },
      (err: unknown) => {
        setStartError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      },
    );
  }, []);

  useEffect(() => start(), [start]);

  const refreshCounts = useCallback(
    async (state?: SyncStatus['state']) => {
      if (!env || !session) return;
      const [queued, rejected, lastSyncAt] = await Promise.all([
        countQueued(env.db, session.user.id),
        rejectedFor(env.db, session.user.id),
        getMeta(env.db, 'lastSyncAt'),
      ]);
      setSync((prev) => ({
        state: state ?? prev.state,
        queued,
        rejected: rejected.length,
        lastSyncAt,
      }));
    },
    [env, session],
  );

  const syncNow = useCallback(async () => {
    if (!env || !session || !runner.current) return;
    const report = await runner.current.run(session);
    if (report.state === 'device-blocked') {
      // FR-05: lock the app but keep all local records (docs/DECISIONS.md).
      await authSignOut(env);
      setSession(null);
      setStatus('blocked');
      return;
    }
    await refreshCounts(report.state);
    setDataVersion((v) => v + 1);
  }, [env, session, refreshCounts]);

  // Sync on sign-in, every 2 minutes, when the app comes to the front, and when signal returns.
  useEffect(() => {
    if (status !== 'signed-in') return;
    void syncNow();
    const timer = setInterval(() => void syncNow(), SYNC_EVERY_MS);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && void syncNow());
    let wasConnected = true;
    const net = NetInfo.addEventListener((s) => {
      const connected = Boolean(s.isConnected);
      if (connected && !wasConnected) void syncNow();
      wasConnected = connected;
    });
    return () => {
      clearInterval(timer);
      appState.remove();
      net();
    };
  }, [status, syncNow]);

  const value = useMemo<AppContextValue>(
    () => ({
      status,
      startError,
      retryStart: () => {
        setStatus('loading');
        setStartError(null);
        start();
      },
      env,
      session,
      locale,
      setLocale: (l) => {
        setLocaleState(l);
        void env?.store.set('locale', l);
      },
      t: (key, params) => translate(locale, key, params),
      signIn: async (agentNumber, pin) => {
        if (!env) return { ok: false, reason: 'no_offline_profile' };
        const result = await authSignIn(env, agentNumber, pin);
        if (result.ok) {
          setSession(result.session);
          setStatus('signed-in');
        } else if (result.reason === 'device_blocked') {
          setStatus('blocked');
        }
        return result;
      },
      signOut: async () => {
        if (!env) return;
        await authSignOut(env);
        setSession(null);
        setStatus('signed-out');
      },
      sync,
      syncNow,
      dataVersion,
      afterWrite: () => {
        setDataVersion((v) => v + 1);
        void refreshCounts();
        void syncNow(); // docs/SYNC.md §6: sync after each issue or exit
      },
    }),
    [status, startError, start, env, session, locale, sync, syncNow, dataVersion, refreshCounts],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
