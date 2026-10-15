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
    'CONFLICT',
    'SERIAL_NOT_ALLOCATED',
    'VEHICLE_CLASS_INACTIVE',
    'NO_TARIFF',
    'ALREADY_PAID',
    'CHARGE_CHANGED',
    'INSUFFICIENT_PAYMENT',
    'RATE_LIMITED',
    'SMS_FAILED',
    'INTERNAL',
  ]),
  message: z.string(),
  /** Wrong-PIN responses tell the agent how many tries are left before lockout (FR-03). */
  remainingAttempts: z.int().nonnegative().optional(),
  /** CHARGE_CHANGED carries the new quote to show the driver. */
  quote: z
    .object({
      exitAt: z.iso.datetime(),
      durationMinutes: z.int().nonnegative(),
      hoursCharged: z.int().positive(),
      tariffCentsPerHour: z.int().nonnegative(),
      amountCents: z.int().nonnegative(),
    })
    .optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ErrorCode = ErrorResponse['error'];
