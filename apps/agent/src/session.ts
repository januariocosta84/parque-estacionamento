import type { SessionUser } from '@estacionamento/shared';

/** The signed-in agent on this phone. */
export interface Session {
  user: SessionUser;
  deviceId: string;
  /** API token from the last online sign-in; may have expired. Null when never online. */
  token: string | null;
  /** How this sign-in was checked. */
  mode: 'online' | 'offline';
}
