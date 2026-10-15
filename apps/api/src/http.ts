import type { FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import type { ErrorCode, ErrorResponse } from '@estacionamento/shared';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  CODE_EXPIRED: 401,
  FORBIDDEN: 403,
  DEVICE_BLOCKED: 403,
  NOT_FOUND: 404,
  ACCOUNT_LOCKED: 423,
  CONFLICT: 409,
  ALREADY_PAID: 409,
  CHARGE_CHANGED: 409,
  SERIAL_NOT_ALLOCATED: 422,
  VEHICLE_CLASS_INACTIVE: 422,
  NO_TARIFF: 422,
  INSUFFICIENT_PAYMENT: 422,
  RATE_LIMITED: 429,
  SMS_FAILED: 502,
  INTERNAL: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: Partial<ErrorResponse> = {},
  ) {
    super(message);
  }

  get statusCode(): number {
    return STATUS[this.code];
  }
}

export function sendError(reply: FastifyReply, err: ApiError) {
  const body: ErrorResponse = { error: err.code, message: err.message, ...err.extra };
  return reply.status(err.statusCode).send(body);
}

/** Parse request input with the route's shared zod schema, or throw 400. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    throw new ApiError('BAD_REQUEST', message);
  }
  return result.data;
}
