import { z } from 'zod';
import {
  idSchema,
  pinSchema,
  roleSchema,
  timestampSchema,
  userStatusSchema,
} from '../schemas/records';

/** The signed-in user as the apps see it (no hashes). */
export const sessionUserSchema = z.object({
  id: idSchema,
  name: z.string(),
  agentNumber: z.string().nullable(),
  username: z.string().nullable(),
  role: roleSchema,
  status: userStatusSchema,
  areaIds: z.array(idSchema),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const sessionResponseSchema = z.object({
  token: z.string().min(32),
  expiresAt: timestampSchema,
  user: sessionUserSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** POST /auth/agent/login (FR-01, FR-03, FR-05) */
export const agentLoginRequestSchema = z.object({
  agentNumber: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.toUpperCase()),
  pin: pinSchema,
  /** Client-generated id of this phone; registered on first sign-in. */
  deviceId: idSchema,
});
export type AgentLoginRequest = z.infer<typeof agentLoginRequestSchema>;

/** POST /auth/console/login — step 1 of FR-04: password, then an SMS code. */
export const consoleLoginRequestSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
export type ConsoleLoginRequest = z.infer<typeof consoleLoginRequestSchema>;

export const consoleLoginResponseSchema = z.object({
  challengeId: idSchema,
  expiresAt: timestampSchema,
});
export type ConsoleLoginResponse = z.infer<typeof consoleLoginResponseSchema>;

/** POST /auth/console/verify — step 2 of FR-04. */
export const consoleVerifyRequestSchema = z.object({
  challengeId: idSchema,
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});
export type ConsoleVerifyRequest = z.infer<typeof consoleVerifyRequestSchema>;

/** GET /me */
export const meResponseSchema = z.object({ user: sessionUserSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

/** POST /users/:id/reset-pin — supervisor unlocks an agent and sets a new PIN (FR-03). */
export const resetPinRequestSchema = z.object({
  pin: pinSchema,
  reason: z.string().trim().min(1).max(500),
});
export type ResetPinRequest = z.infer<typeof resetPinRequestSchema>;

export const userIdParamsSchema = z.object({ id: idSchema });
