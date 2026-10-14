// HTTP client for the API. Responses are checked with the shared zod schemas.
import {
  errorResponseSchema,
  pullResponseSchema,
  pushResponseSchema,
  serialBlocksResponseSchema,
  sessionResponseSchema,
} from '@estacionamento/shared';
import type {
  AgentLoginRequest,
  ErrorResponse,
  PullResponse,
  PushRequest,
  PushResponse,
  SerialBlocksResponse,
  SessionResponse,
} from '@estacionamento/shared';
import type { ZodType } from 'zod';

/** No answer from the server (no signal, timeout, server down). The app works offline. */
export class NetworkError extends Error {}

/** The server answered with an error. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorResponse,
  ) {
    super(body.message);
  }

  get code() {
    return this.body.error;
  }
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export class ApiClient {
  token: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
    private readonly timeoutMs = 15_000,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    schema: ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(this.baseUrl + path, {
        method,
        headers: {
          // Fastify rejects an empty body sent as JSON, so only say JSON when there is a body.
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new NetworkError(err instanceof Error ? err.message : 'Network error');
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const parsed = errorResponseSchema.safeParse(json);
      if (res.status >= 500 || !parsed.success)
        throw new NetworkError(`Server error ${res.status}`);
      throw new ApiRequestError(res.status, parsed.data);
    }
    return schema.parse(json);
  }

  agentLogin(body: AgentLoginRequest): Promise<SessionResponse> {
    return this.request('POST', '/auth/agent/login', sessionResponseSchema, body);
  }

  serialBlocks(): Promise<SerialBlocksResponse> {
    return this.request('POST', '/sync/serial-blocks', serialBlocksResponseSchema);
  }

  push(body: PushRequest): Promise<PushResponse> {
    return this.request('POST', '/sync/push', pushResponseSchema, body);
  }

  pull(since: string | null): Promise<PullResponse> {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    return this.request('GET', `/sync/pull${qs}`, pullResponseSchema);
  }
}
