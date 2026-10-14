// Server-side client for the API. The console's browser never sees the API token: pages and
// server actions call the API from the Next.js server with the token from an httpOnly cookie.
import 'server-only';
import { errorResponseSchema } from '@estacionamento/shared';
import type { ErrorCode, ErrorResponse } from '@estacionamento/shared';
import type { ZodType } from 'zod';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly body?: ErrorResponse,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  schema: ZodType<T>,
  options: { token?: string | null; method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'API unreachable');
  }
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(json);
    if (!parsed.success) throw new ApiError(res.status, 'INTERNAL', `API error ${res.status}`);
    throw new ApiError(res.status, parsed.data.error, parsed.data.message, parsed.data);
  }
  return schema.parse(json);
}

/** Query string from the defined values only. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  return entries.length
    ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`
    : '';
}
