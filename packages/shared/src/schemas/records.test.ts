import { describe, expect, it } from 'vitest';
import {
  deviceSchema,
  eventSchema,
  pinSchema,
  plateSchema,
  tariffSchema,
  ticketSchema,
  userSchema,
} from './records';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const activeTicket = {
  id: id(1),
  serial: '2538668/MAE/A.M.DILI',
  plate: 'a-2847-tl ',
  vehicleClassId: id(2),
  areaId: id(3),
  agentId: id(4),
  deviceId: id(5),
  entryAt: '2026-10-13T00:20:00Z',
  exitAt: null,
  hoursCharged: null,
  tariffCentsPerHour: 50,
  amountCents: null,
  status: 'ATIVO',
};

describe('ticketSchema', () => {
  it('accepts an active ticket and upper-cases the plate', () => {
    expect(ticketSchema.parse(activeTicket).plate).toBe('A-2847-TL');
  });

  it('accepts a paid ticket with exit, hours and amount', () => {
    const paid = {
      ...activeTicket,
      status: 'PAGO',
      exitAt: '2026-10-13T02:05:00Z',
      hoursCharged: 2,
      amountCents: 100,
    };
    expect(ticketSchema.safeParse(paid).success).toBe(true);
  });

  it('rejects a paid ticket without an amount', () => {
    expect(ticketSchema.safeParse({ ...activeTicket, status: 'PAGO' }).success).toBe(false);
  });

  it('rejects money that is not integer cents', () => {
    expect(ticketSchema.safeParse({ ...activeTicket, tariffCentsPerHour: 0.5 }).success).toBe(
      false,
    );
  });

  it('rejects a bad serial and an exit before entry', () => {
    expect(ticketSchema.safeParse({ ...activeTicket, serial: 'DL-26-00148' }).success).toBe(false);
    expect(
      ticketSchema.safeParse({ ...activeTicket, exitAt: '2026-10-13T00:19:00Z' }).success,
    ).toBe(false);
  });

  it('rejects an unknown status (only ATIVO and PAGO)', () => {
    expect(ticketSchema.safeParse({ ...activeTicket, status: 'CANCELADO' }).success).toBe(false);
  });
});

describe('field schemas', () => {
  it('PIN is exactly 6 digits', () => {
    expect(pinSchema.safeParse('123456').success).toBe(true);
    expect(pinSchema.safeParse('12345').success).toBe(false);
    expect(pinSchema.safeParse('12345a').success).toBe(false);
  });

  it('plate cannot be blank', () => {
    expect(plateSchema.safeParse('   ').success).toBe(false);
  });
});

describe('userSchema', () => {
  const base = {
    id: id(1),
    name: 'Agente Teste',
    agentNumber: null,
    username: null,
    areaIds: [id(3)],
    status: 'ACTIVE',
    phone: null,
  };

  it('agents need an agent number, console users a username', () => {
    expect(
      userSchema.safeParse({ ...base, role: 'agent', agentNumber: 'amd-017' }).data?.agentNumber,
    ).toBe('AMD-017');
    expect(userSchema.safeParse({ ...base, role: 'agent' }).success).toBe(false);
    expect(userSchema.safeParse({ ...base, role: 'supervisor', username: 'sup' }).success).toBe(
      true,
    );
    expect(userSchema.safeParse({ ...base, role: 'supervisor' }).success).toBe(false);
  });
});

describe('eventSchema', () => {
  it('accepts a console event with no device or ticket', () => {
    const event = {
      id: id(9),
      ref: 'EVT-1',
      type: 'ADMIN_CHANGE',
      at: '2026-10-13T00:20:00Z',
      userId: id(1),
      deviceId: null,
      ticketId: null,
      details: { field: 'centsPerHour', from: 50, to: 75, reason: 'test' },
    };
    expect(eventSchema.safeParse(event).success).toBe(true);
  });
});

describe('deviceSchema and tariffSchema', () => {
  it('serial block needs both ends in order', () => {
    const device = { id: id(5), userId: null, status: 'ACTIVE', lastSyncAt: null };
    expect(
      deviceSchema.safeParse({ ...device, serialBlockStart: null, serialBlockEnd: null }).success,
    ).toBe(true);
    expect(
      deviceSchema.safeParse({ ...device, serialBlockStart: 10, serialBlockEnd: 59 }).success,
    ).toBe(true);
    expect(
      deviceSchema.safeParse({ ...device, serialBlockStart: 10, serialBlockEnd: null }).success,
    ).toBe(false);
    expect(
      deviceSchema.safeParse({ ...device, serialBlockStart: 60, serialBlockEnd: 59 }).success,
    ).toBe(false);
  });

  it('tariff period must end after it starts', () => {
    const tariff = {
      id: id(7),
      vehicleClassId: id(2),
      centsPerHour: 50,
      validFrom: '2026-01-01T00:00:00Z',
      changedBy: id(1),
    };
    expect(tariffSchema.safeParse({ ...tariff, validUntil: null }).success).toBe(true);
    expect(tariffSchema.safeParse({ ...tariff, validUntil: '2025-01-01T00:00:00Z' }).success).toBe(
      false,
    );
  });
});
