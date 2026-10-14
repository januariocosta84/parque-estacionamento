// SMS sending. The provider is an open decision, so R1 uses a stub that writes to the server log
// (allowed for FR-04 until a provider is chosen). Swap in a real SmsSender later.
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
