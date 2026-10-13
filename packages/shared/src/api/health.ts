import { z } from 'zod';

/** GET /health */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  time: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
