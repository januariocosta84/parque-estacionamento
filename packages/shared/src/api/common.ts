import { z } from 'zod';

/** Every API error has this shape. `error` is a stable code the apps translate. */
export const errorResponseSchema = z.object({
  error: z.enum([
    'BAD_REQUEST',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'INVALID_CREDENTIALS',
    'ACCOUNT_LOCKED',
    'DEVICE_BLOCKED',
    'CODE_EXPIRED',
    'INTERNAL',
  ]),
  message: z.string(),
  /** Wrong-PIN responses tell the agent how many tries are left before lockout (FR-03). */
  remainingAttempts: z.int().nonnegative().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ErrorCode = ErrorResponse['error'];
