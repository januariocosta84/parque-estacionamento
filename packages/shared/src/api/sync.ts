// Offline sync between the agent app and the API. Protocol: docs/SYNC.md.
import { z } from 'zod';
import {
  areaSchema,
  centsSchema,
  idSchema,
  paymentMethodSchema,
  plateSchema,
  serialSchema,
  tariffSchema,
  ticketSchema,
  timestampSchema,
  vehicleClassSchema,
} from '../schemas/records';
import { errorResponseSchema } from './common';

// ── Serial blocks ───────────────────────────────────────────────────────────

/** POST /sync/serial-blocks — make sure this phone holds its open blocks; returns them. */
export const serialBlocksResponseSchema = z.object({
  blocks: z.array(z.object({ start: z.int().positive(), end: z.int().positive() })),
});
export type SerialBlocksResponse = z.infer<typeof serialBlocksResponseSchema>;

// ── Push ────────────────────────────────────────────────────────────────────

/** A ticket issued on the phone. Agent and device come from the session. */
export const ticketIssuedItemSchema = z.object({
  kind: z.literal('TICKET_ISSUED'),
  ticket: z.object({
    id: idSchema,
    serial: serialSchema,
    plate: plateSchema,
    vehicleClassId: idSchema,
    areaId: idSchema,
    /** Phone clock at issue (BR-09). */
    entryAt: timestampSchema,
    /** Tariff the phone applied, from its last pull. */
    tariffCentsPerHour: centsSchema,
    driverPhone: z.string().trim().min(1).max(30).nullable().optional(),
  }),
  issueEventId: idSchema,
});

/** Exit and cash payment recorded on the phone. */
export const ticketClosedItemSchema = z.object({
  kind: z.literal('TICKET_CLOSED'),
  ticketId: idSchema,
  exitAt: timestampSchema,
  hoursCharged: z.int().positive(),
  amountCents: centsSchema,
  payment: z.object({
    id: idSchema,
    method: paymentMethodSchema,
    receivedCents: centsSchema,
  }),
  exitEventId: idSchema,
  paymentEventId: idSchema,
});

/** A sign-in attempt made offline (FR-02, NFR-07). */
export const signInItemSchema = z.object({
  kind: z.literal('SIGN_IN'),
  eventId: idSchema,
  at: timestampSchema,
  success: z.boolean(),
  reason: z.enum(['wrong_pin', 'wrong_pin_locked', 'account_locked']).optional(),
});

export const pushItemSchema = z.discriminatedUnion('kind', [
  ticketIssuedItemSchema,
  ticketClosedItemSchema,
  signInItemSchema,
]);
export type PushItem = z.infer<typeof pushItemSchema>;
export type TicketIssuedItem = z.infer<typeof ticketIssuedItemSchema>;
export type TicketClosedItem = z.infer<typeof ticketClosedItemSchema>;
export type SignInItem = z.infer<typeof signInItemSchema>;

/** POST /sync/push */
export const pushRequestSchema = z.object({
  /** Phone clock when sending, to measure skew. */
  deviceTime: timestampSchema,
  items: z.array(pushItemSchema).min(1).max(200),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

export const pushResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('applied') }),
  z.object({ status: z.literal('duplicate') }),
  /** Depends on something the server has not received yet; send again next sync. */
  z.object({ status: z.literal('pending'), message: z.string() }),
  z.object({
    status: z.literal('rejected'),
    error: errorResponseSchema.shape.error,
    message: z.string(),
  }),
]);
export type PushResult = z.infer<typeof pushResultSchema>;

/** One result per item, in the same order as the request. */
export const pushResponseSchema = z.object({
  results: z.array(pushResultSchema),
  clockSkewSeconds: z.int(),
});
export type PushResponse = z.infer<typeof pushResponseSchema>;

// ── Pull ────────────────────────────────────────────────────────────────────

/** GET /sync/pull?since=<cursor> */
export const pullQuerySchema = z.object({
  since: timestampSchema.optional(),
});

export const pullResponseSchema = z.object({
  /** Pass back as `since` next time. */
  cursor: timestampSchema,
  /** More tickets changed than fit in one response; pull again with `cursor`. */
  hasMore: z.boolean(),
  areas: z.array(areaSchema),
  vehicleClasses: z.array(vehicleClassSchema),
  tariffs: z.array(tariffSchema),
  settings: z.object({
    chargingRule: z.object({ minimumHours: z.int(), graceMinutes: z.int() }),
    pinMaxAttempts: z.int(),
    clockSkewWarnSeconds: z.int(),
  }),
  /** Tickets this agent may see that changed since the cursor. */
  tickets: z.array(ticketSchema),
  /** Active tickets in the agent's areas that someone else closed: drop from the parked list. */
  closedTicketIds: z.array(idSchema),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;

// ── Devices (FR-05) ─────────────────────────────────────────────────────────

/** POST /devices/:id/block — supervisor blocks a lost or stolen phone. */
export const blockDeviceRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type BlockDeviceRequest = z.infer<typeof blockDeviceRequestSchema>;
