// Sending console sign-in codes (FR-04). Provider: Fonnte, a WhatsApp gateway
// (docs/DECISIONS.md); the log stub remains for development.
import type { FastifyBaseLogger } from 'fastify';

export interface SmsSender {
  send(to: string | null, text: string): Promise<void>;
}

export class LogSmsSender implements SmsSender {
  constructor(private readonly log: FastifyBaseLogger) {}

  async send(to: string | null, text: string): Promise<void> {
    this.log.warn({ to }, `[SMS stub] ${text}`);
  }
}

/** Keeps sent messages in memory; for tests. */
export class MemorySmsSender implements SmsSender {
  readonly sent: { to: string | null; text: string }[] = [];

  async send(to: string | null, text: string): Promise<void> {
    this.sent.push({ to, text });
  }
}

/**
 * Digits of the full international number, e.g. "+670 7700 0001" → "67077000001".
 * An 8-digit number is a local Timor-Leste number and gets `defaultCountry` in front.
 */
export function normalizePhone(phone: string, defaultCountry: string): string | null {
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 6) return null;
  return digits.length === 8 ? `${defaultCountry}${digits}` : digits;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/** Fonnte API (https://docs.fonnte.com/api-send-message/). Sends a WhatsApp message. */
export class FonnteSender implements SmsSender {
  constructor(
    private readonly token: string,
    private readonly defaultCountry: string,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
  ) {}

  async send(to: string | null, text: string): Promise<void> {
    const target = to ? normalizePhone(to, this.defaultCountry) : null;
    if (!target) throw new Error('This user has no phone number to send the code to');

    const form = new FormData();
    form.set('target', target);
    form.set('message', text);
    // "0": Fonnte must not rewrite the number; it is already international (default would be 62).
    form.set('countryCode', '0');

    const res = await this.fetchFn('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: this.token },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}`);
    const body = (await res.json()) as { status?: boolean; Status?: boolean; reason?: string };
    if ((body.status ?? body.Status) !== true) {
      throw new Error(`Fonnte refused the message: ${body.reason ?? 'unknown reason'}`);
    }
  }
}
