import { z } from 'zod';
import {
  centsSchema,
  idSchema,
  paymentMethodSchema,
  plateSchema,
  serialSchema,
  ticketCopySchema,
  ticketSchema,
  ticketStatusSchema,
  timestampSchema,
} from '../schemas/records';

/**
 * POST /tickets — issue a ticket (FR-06, FR-07, FR-10). Agents only.
 * Entry time, agent and device come from the server and session, never from the request (BR-09).
 */
export const issueTicketRequestSchema = z.object({
  /** Client-generated, so a retried request does not create a second ticket. */
  id: idSchema,
  /** Next serial from this device's allocated block (FR-08). */
  serial: serialSchema,
  plate: plateSchema,
  vehicleClassId: idSchema,
  /** Optional when the agent works in a single area. */
  areaId: idSchema.optional(),
  driverPhone: z.string().trim().min(1).max(30).optional(),
});
export type IssueTicketRequest = z.infer<typeof issueTicketRequestSchema>;

/** A ticket as the apps see it, with display references. */
export const ticketViewSchema = z.object({
  ticket: ticketSchema,
  /** Reference of the ISSUE event, e.g. "EVT-2538668-01". */
  issueRef: z.string(),
  /** FR-10 / BR-08: white = owner, yellow = AMD Finance, red = audit. */
  copies: z.array(ticketCopySchema),
});
export type TicketView = z.infer<typeof ticketViewSchema>;

/** GET /tickets/:id/charge — what the driver would pay if they left now (FR-14). */
export const chargeQuoteSchema = z.object({
  ticketId: idSchema,
  entryAt: timestampSchema,
  exitAt: timestampSchema,
  durationMinutes: z.int().nonnegative(),
  hoursCharged: z.int().positive(),
  tariffCentsPerHour: centsSchema,
  amountCents: centsSchema,
});
export type ChargeQuote = z.infer<typeof chargeQuoteSchema>;

/**
 * POST /tickets/:id/exit — record exit and cash payment in one step (FR-14–17,
 * docs/DECISIONS.md). If the charge changed since the quote the agent showed the driver
 * (a new hour started), the server answers CHARGE_CHANGED with a fresh quote.
 */
export const recordExitRequestSchema = z.object({
  /** Client-generated payment id; makes a retried request safe. */
  paymentId: idSchema,
  method: paymentMethodSchema,
  /** The amount shown to the driver, from the quote. */
  expectedAmountCents: centsSchema,
  /** Cash handed over by the driver; must cover the charge (FR-15). */
  receivedCents: centsSchema,
});
export type RecordExitRequest = z.infer<typeof recordExitRequestSchema>;

/** Receipt (FR-16). */
export const receiptSchema = z.object({
  ticketId: idSchema,
  receiptNo: z.string(),
  serial: serialSchema,
  plate: z.string(),
  vehicleClassId: idSchema,
  entryAt: timestampSchema,
  exitAt: timestampSchema,
  hoursCharged: z.int().positive(),
  tariffCentsPerHour: centsSchema,
  amountCents: centsSchema,
  receivedCents: centsSchema,
  changeCents: centsSchema,
  method: paymentMethodSchema,
  agent: z.object({ id: idSchema, name: z.string(), agentNumber: z.string().nullable() }),
  /** Reference of the PAYMENT event, e.g. "EVT-2538668-03". */
  paymentRef: z.string(),
  paidAt: timestampSchema,
});
export type Receipt = z.infer<typeof receiptSchema>;

/** GET /tickets — find and list tickets (FR-13, FR-18, FR-21, FR-23). */
export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  /** Plate or serial, partial match, any case. */
  q: z.string().trim().min(1).max(40).optional(),
  /** Dili calendar day, YYYY-MM-DD; tickets issued that day. */
  date: z.iso.date().optional(),
  areaId: idSchema.optional(),
  agentId: idSchema.optional(),
  /** Oldest first (FR-23 active list) or newest first (history). */
  order: z.enum(['oldest', 'newest']).default('newest'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTicketsQuery = z.input<typeof listTicketsQuerySchema>;

export const ticketListItemSchema = ticketSchema.and(
  z.object({ issueRef: z.string(), lastEventRef: z.string() }),
);
export type TicketListItem = z.infer<typeof ticketListItemSchema>;

export const listTicketsResponseSchema = z.object({
  items: z.array(ticketListItemSchema),
  total: z.int().nonnegative(),
});
export type ListTicketsResponse = z.infer<typeof listTicketsResponseSchema>;

/** GET /me/today — the agent's own totals for today, Dili time (FR-19). */
export const todaySummarySchema = z.object({
  date: z.iso.date(),
  /** Active tickets this agent issued (still parked). */
  parkedCount: z.int().nonnegative(),
  /** Cash this agent received today. */
  receivedTodayCents: centsSchema,
});
export type TodaySummary = z.infer<typeof todaySummarySchema>;

export const ticketIdParamsSchema = z.object({ id: idSchema });
