// API used by the supervisor / finance / audit / admin console (M7).
import { z } from 'zod';
import {
  areaSchema,
  centsSchema,
  eventTypeSchema,
  idSchema,
  pinSchema,
  roleSchema,
  serialSchema,
  tariffSchema,
  timestampSchema,
  userStatusSchema,
  vehicleClassSchema,
} from '../schemas/records';

/** Filters shared by every console view (FR-21). `date` is a Dili calendar day. */
export const consoleFiltersSchema = z.object({
  date: z.iso.date().optional(),
  areaId: idSchema.optional(),
  agentId: idSchema.optional(),
});
export type ConsoleFilters = z.infer<typeof consoleFiltersSchema>;

export const agentSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  agentNumber: z.string().nullable(),
  areaIds: z.array(idSchema),
});
export type AgentSummary = z.infer<typeof agentSummarySchema>;

/** GET /reference — areas, vehicle classes and agents the user may filter by. */
export const referenceResponseSchema = z.object({
  areas: z.array(areaSchema),
  vehicleClasses: z.array(vehicleClassSchema),
  agents: z.array(agentSummarySchema),
});
export type ReferenceResponse = z.infer<typeof referenceResponseSchema>;

/** GET /monitor — live totals (FR-20). */
export const monitorResponseSchema = z.object({
  date: z.iso.date(),
  generatedAt: timestampSchema,
  parked: z.object({
    count: z.int().nonnegative(),
    byClass: z.array(z.object({ vehicleClassId: idSchema, count: z.int().nonnegative() })),
  }),
  received: z.object({ amountCents: centsSchema, payments: z.int().nonnegative() }),
  issued: z.object({
    count: z.int().nonnegative(),
    active: z.int().nonnegative(),
    paid: z.int().nonnegative(),
  }),
  exits: z.int().nonnegative(),
});
export type MonitorResponse = z.infer<typeof monitorResponseSchema>;

/** GET /events — the audit log (FR-26) and recent activity. */
export const listEventsQuerySchema = consoleFiltersSchema.extend({
  type: eventTypeSchema.optional(),
  /** Event reference, plate or serial. */
  q: z.string().trim().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListEventsQuery = z.input<typeof listEventsQuerySchema>;

export const eventViewSchema = z.object({
  id: idSchema,
  ref: z.string(),
  type: eventTypeSchema,
  at: timestampSchema,
  user: z.object({
    id: idSchema,
    name: z.string(),
    agentNumber: z.string().nullable(),
    username: z.string().nullable(),
  }),
  deviceId: idSchema.nullable(),
  ticket: z.object({ id: idSchema, serial: serialSchema, plate: z.string() }).nullable(),
  details: z.record(z.string(), z.unknown()),
});
export type EventView = z.infer<typeof eventViewSchema>;

export const listEventsResponseSchema = z.object({
  items: z.array(eventViewSchema),
  total: z.int().nonnegative(),
});
export type ListEventsResponse = z.infer<typeof listEventsResponseSchema>;

/** GET /reports/daily — revenue per agent and per area for one Dili day (FR-25). */
const revenueLineSchema = z.object({
  payments: z.int().nonnegative(),
  amountCents: centsSchema,
});
export const dailyReportResponseSchema = z.object({
  date: z.iso.date(),
  total: revenueLineSchema.extend({
    issued: z.int().nonnegative(),
    stillParked: z.int().nonnegative(),
  }),
  byAgent: z.array(
    revenueLineSchema.extend({
      agentId: idSchema,
      name: z.string(),
      agentNumber: z.string().nullable(),
    }),
  ),
  byArea: z.array(revenueLineSchema.extend({ areaId: idSchema, name: z.string() })),
});
export type DailyReportResponse = z.infer<typeof dailyReportResponseSchema>;

// ── Admin (FR-28). Every change writes an ADMIN_CHANGE event. ──────────────────

export const adminUserSchema = z.object({
  id: idSchema,
  name: z.string(),
  agentNumber: z.string().nullable(),
  username: z.string().nullable(),
  role: roleSchema,
  status: userStatusSchema,
  phone: z.string().nullable(),
  areaIds: z.array(idSchema),
  createdAt: timestampSchema,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUsersResponseSchema = z.object({ users: z.array(adminUserSchema) });

const phoneSchema = z.string().trim().min(6).max(30);
const passwordSchema = z.string().min(12, 'Password must be at least 12 characters');

/** POST /admin/users — agents get an agent number and PIN; console users a username and password. */
export const createUserRequestSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('agent'),
    name: z.string().trim().min(1),
    agentNumber: z
      .string()
      .trim()
      .min(1)
      .transform((s) => s.toUpperCase()),
    pin: pinSchema,
    phone: phoneSchema.optional(),
    areaIds: z.array(idSchema).min(1),
  }),
  z.object({
    role: z.enum(['supervisor', 'finance', 'auditor', 'admin']),
    name: z.string().trim().min(1),
    username: z.string().trim().min(3).max(40),
    password: passwordSchema,
    phone: phoneSchema,
    areaIds: z.array(idSchema),
  }),
]);
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

/** POST /admin/users/:id — change name, phone, areas or status (LOCKED / ACTIVE). */
export const updateUserRequestSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: phoneSchema.nullable().optional(),
    areaIds: z.array(idSchema).optional(),
    status: userStatusSchema.optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .refine((u) => Object.keys(u).some((k) => k !== 'reason'), 'Nothing to change');
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const createAreaRequestSchema = z.object({ name: z.string().trim().min(1).max(60) });
export const updateAreaRequestSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  active: z.boolean().optional(),
});

export const createVehicleClassRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]+$/, 'Letters, digits and _ only')
    .transform((s) => s.toUpperCase()),
  namePt: z.string().trim().min(1),
  nameTet: z.string().trim().min(1),
});
/** Activating a class needs a tariff in force (NO_TARIFF otherwise). */
export const updateVehicleClassRequestSchema = z.object({
  namePt: z.string().trim().min(1).optional(),
  nameTet: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
});

/**
 * POST /admin/tariffs — a new tariff for a class from `validFrom` (now if omitted). The tariff in
 * force is closed at that instant; tickets already issued keep their tariff (BR-04, FR-28).
 */
export const setTariffRequestSchema = z.object({
  vehicleClassId: idSchema,
  centsPerHour: centsSchema,
  validFrom: timestampSchema.optional(),
  reason: z.string().trim().min(1).max(500),
});
export type SetTariffRequest = z.infer<typeof setTariffRequestSchema>;

export const adminCatalogResponseSchema = z.object({
  areas: z.array(areaSchema),
  vehicleClasses: z.array(vehicleClassSchema),
  tariffs: z.array(tariffSchema),
});
export type AdminCatalogResponse = z.infer<typeof adminCatalogResponseSchema>;

export const idParamsSchema = z.object({ id: idSchema });
