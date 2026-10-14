// Records from docs/REQUIREMENTS.md "Data", as they travel between app, API and console.
// Times are ISO-8601 UTC strings. Money is integer cents. Password and PIN hashes never leave the API.
import { z } from 'zod';
import { isValidSerial } from '../serial';

// ── Enums ────────────────────────────────────────────────────────────────────

export const roleSchema = z.enum(['agent', 'supervisor', 'finance', 'auditor', 'admin']);
export type Role = z.infer<typeof roleSchema>;

/** BR-05: Ativo → Pago only. */
export const ticketStatusSchema = z.enum(['ATIVO', 'PAGO']);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

/** Cash only in Release 1 (FR-15). */
export const paymentMethodSchema = z.enum(['CASH']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const eventTypeSchema = z.enum([
  'ISSUE',
  'EXIT',
  'PAYMENT',
  'PRINT',
  'SMS',
  'CORRECTION',
  'SIGN_IN',
  'ADMIN_CHANGE',
]);
export type EventType = z.infer<typeof eventTypeSchema>;

export const userStatusSchema = z.enum(['ACTIVE', 'LOCKED']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const deviceStatusSchema = z.enum(['ACTIVE', 'BLOCKED']);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

/** BR-08: white = owner, yellow = AMD Finance, red = audit. */
export const ticketCopySchema = z.enum(['WHITE', 'YELLOW', 'RED']);
export type TicketCopy = z.infer<typeof ticketCopySchema>;

// ── Field types ──────────────────────────────────────────────────────────────

export const idSchema = z.uuid();
export const timestampSchema = z.iso.datetime();
export const centsSchema = z.int().nonnegative();

/** Plates are stored upper case as written: "a-2847-tl " → "A-2847-TL". */
export const plateSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((s) => s.toUpperCase());

export const serialSchema = z.string().refine(isValidSerial, 'Invalid serial number');

/** FR-01: 6-digit PIN. */
export const pinSchema = z.string().regex(/^\d{6}$/, 'PIN must be 6 digits');

// ── Records ──────────────────────────────────────────────────────────────────

export const ticketSchema = z
  .object({
    id: idSchema,
    serial: serialSchema,
    plate: plateSchema,
    vehicleClassId: idSchema,
    areaId: idSchema,
    agentId: idSchema,
    deviceId: idSchema,
    entryAt: timestampSchema,
    exitAt: timestampSchema.nullable(),
    hoursCharged: z.int().positive().nullable(),
    tariffCentsPerHour: centsSchema,
    amountCents: centsSchema.nullable(),
    status: ticketStatusSchema,
    driverPhone: z.string().trim().min(1).nullable().optional(),
  })
  .refine(
    (t) =>
      t.status === 'ATIVO' ||
      (t.exitAt !== null && t.hoursCharged !== null && t.amountCents !== null),
    { message: 'A paid ticket needs exit time, hours charged and amount', path: ['status'] },
  )
  .refine((t) => t.exitAt === null || Date.parse(t.exitAt) >= Date.parse(t.entryAt), {
    message: 'Exit time is before entry time',
    path: ['exitAt'],
  });
export type Ticket = z.infer<typeof ticketSchema>;

export const paymentSchema = z.object({
  id: idSchema,
  ticketId: idSchema,
  receiptNo: z.string().min(1),
  amountCents: centsSchema,
  method: paymentMethodSchema,
  receivedAt: timestampSchema,
  agentId: idSchema,
});
export type Payment = z.infer<typeof paymentSchema>;

export const eventSchema = z.object({
  id: idSchema,
  /** Human-readable reference shown on receipts, e.g. "EVT-00148-03". Format not final. */
  ref: z.string().min(1),
  type: eventTypeSchema,
  at: timestampSchema,
  userId: idSchema,
  /** Null for console actions, which have no registered device. */
  deviceId: idSchema.nullable(),
  ticketId: idSchema.nullable(),
  details: z.record(z.string(), z.unknown()),
});
/** Named AuditEvent so it does not shadow the DOM `Event` type in the console. */
export type AuditEvent = z.infer<typeof eventSchema>;

export const userSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1),
    /** Agents sign in with this, e.g. "AMD-017". */
    agentNumber: z
      .string()
      .trim()
      .min(1)
      .transform((s) => s.toUpperCase())
      .nullable(),
    /** Console users sign in with this. */
    username: z.string().trim().min(1).nullable(),
    role: roleSchema,
    areaIds: z.array(idSchema),
    status: userStatusSchema,
    phone: z.string().trim().min(1).nullable(),
  })
  .refine((u) => (u.role === 'agent' ? u.agentNumber !== null : u.username !== null), {
    message: 'Agents need an agent number; console users need a username',
    path: ['role'],
  });
export type User = z.infer<typeof userSchema>;

export const deviceSchema = z
  .object({
    id: idSchema,
    userId: idSchema.nullable(),
    status: deviceStatusSchema,
    serialBlockStart: z.int().positive().nullable(),
    serialBlockEnd: z.int().positive().nullable(),
    lastSyncAt: timestampSchema.nullable(),
  })
  .refine(
    (d) =>
      (d.serialBlockStart === null) === (d.serialBlockEnd === null) &&
      (d.serialBlockStart === null || d.serialBlockStart <= (d.serialBlockEnd ?? 0)),
    { message: 'Serial block needs both ends, with start ≤ end', path: ['serialBlockEnd'] },
  );
export type Device = z.infer<typeof deviceSchema>;

export const areaSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1),
  active: z.boolean(),
});
export type Area = z.infer<typeof areaSchema>;

export const vehicleClassSchema = z.object({
  id: idSchema,
  code: z.string().trim().min(1),
  namePt: z.string().trim().min(1),
  nameTet: z.string().trim().min(1),
  active: z.boolean(),
});
export type VehicleClass = z.infer<typeof vehicleClassSchema>;

export const tariffSchema = z
  .object({
    id: idSchema,
    vehicleClassId: idSchema,
    centsPerHour: centsSchema,
    validFrom: timestampSchema,
    /** Exclusive. Null = still in force. */
    validUntil: timestampSchema.nullable(),
    changedBy: idSchema,
  })
  .refine((t) => t.validUntil === null || Date.parse(t.validUntil) > Date.parse(t.validFrom), {
    message: 'validUntil must be after validFrom',
    path: ['validUntil'],
  });
export type Tariff = z.infer<typeof tariffSchema>;
