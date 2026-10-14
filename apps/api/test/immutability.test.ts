// Proves the rules hold in PostgreSQL itself, using raw SQL that bypasses the application
// (CLAUDE.md rules 4 and 5; FR-26, BR-05–07).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatSerial } from '@estacionamento/shared';
import type { Db } from '../src/db';
import { writeEvent } from '../src/events';
import { createAgent, hasTestDb, seedTestDb, testDb, unique } from './helpers';

let serialCounter = 3_000_000;
const nextSerial = () => formatSerial(serialCounter++);

describe.skipIf(!hasTestDb)('database guarantees', () => {
  let db: Db;
  let agentId: string;
  let deviceId: string;
  let areaId: string;
  let classId: string;

  beforeAll(async () => {
    db = testDb();
    await seedTestDb(db);
    agentId = (await createAgent(db)).id;
    deviceId = randomUUID();
    await db.device.create({ data: { id: deviceId, userId: agentId } });
    areaId = (await db.area.findUniqueOrThrow({ where: { name: 'Setor A' } })).id;
    // Own class, so the tariffs created here do not mix with the seeded ones.
    classId = (
      await db.vehicleClass.create({
        data: { code: `TEST-${unique()}`, namePt: 'Teste', nameTet: 'Teste' },
      })
    ).id;
  });
  afterAll(() => db.$disconnect());

  function newTicket(overrides: Record<string, unknown> = {}) {
    return db.ticket.create({
      data: {
        id: randomUUID(),
        serial: nextSerial(),
        plate: 'A-2847-TL',
        vehicleClassId: classId,
        areaId,
        agentId,
        deviceId,
        entryAt: new Date('2026-10-13T00:20:00Z'),
        tariffCentsPerHour: 50,
        ...overrides,
      },
    });
  }

  async function payTicket(id: string) {
    await db.ticket.update({
      where: { id },
      data: {
        exitAt: new Date('2026-10-13T02:05:00Z'),
        hoursCharged: 2,
        amountCents: 100,
        status: 'PAGO',
      },
    });
  }

  describe('events are append-only (trigger)', () => {
    it('allows INSERT and gives each event a reference', async () => {
      const event = await writeEvent(db, { type: 'SIGN_IN', userId: agentId });
      expect(event.ref).toMatch(/^EVT-\d{7}$/);
    });

    it('rejects UPDATE', async () => {
      const event = await writeEvent(db, { type: 'SIGN_IN', userId: agentId });
      await expect(
        db.$executeRawUnsafe(`UPDATE events SET details = '{"x":1}' WHERE id = $1::uuid`, event.id),
      ).rejects.toThrow(/append-only/);
      await expect(
        db.event.update({ where: { id: event.id }, data: { type: 'EXIT' } }),
      ).rejects.toThrow(/append-only/);
    });

    it('rejects DELETE', async () => {
      const event = await writeEvent(db, { type: 'SIGN_IN', userId: agentId });
      await expect(
        db.$executeRawUnsafe(`DELETE FROM events WHERE id = $1::uuid`, event.id),
      ).rejects.toThrow(/append-only/);
      expect(await db.event.findUnique({ where: { id: event.id } })).not.toBeNull();
    });

    it('rejects TRUNCATE', async () => {
      await expect(db.$executeRawUnsafe(`TRUNCATE events CASCADE`)).rejects.toThrow(/append-only/);
    });
  });

  describe('tickets: Ativo → Pago only, never deleted (BR-05–07)', () => {
    it('allows recording exit and payment on an active ticket', async () => {
      const t = await newTicket();
      await payTicket(t.id);
      expect((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('PAGO');
    });

    it('rejects any change to a paid ticket, including reopening it', async () => {
      const t = await newTicket();
      await payTicket(t.id);
      await expect(
        db.$executeRawUnsafe(`UPDATE tickets SET status = 'ATIVO' WHERE id = $1::uuid`, t.id),
      ).rejects.toThrow(/is paid/);
      await expect(
        db.$executeRawUnsafe(`UPDATE tickets SET driver_phone = '1' WHERE id = $1::uuid`, t.id),
      ).rejects.toThrow(/is paid/);
    });

    it('rejects changing issue data such as plate or entry time', async () => {
      const t = await newTicket();
      await expect(
        db.$executeRawUnsafe(`UPDATE tickets SET plate = 'X-1-TL' WHERE id = $1::uuid`, t.id),
      ).rejects.toThrow(/CORRECTION/);
      await expect(
        db.$executeRawUnsafe(
          `UPDATE tickets SET entry_at = entry_at - interval '1 hour' WHERE id = $1::uuid`,
          t.id,
        ),
      ).rejects.toThrow(/CORRECTION/);
      await expect(
        db.$executeRawUnsafe(
          `UPDATE tickets SET tariff_cents_per_hour = 0 WHERE id = $1::uuid`,
          t.id,
        ),
      ).rejects.toThrow(/CORRECTION/);
    });

    it('rejects changing an exit once recorded', async () => {
      const t = await newTicket();
      await db.ticket.update({
        where: { id: t.id },
        data: { exitAt: new Date('2026-10-13T02:05:00Z'), hoursCharged: 2, amountCents: 100 },
      });
      await expect(
        db.$executeRawUnsafe(`UPDATE tickets SET amount_cents = 0 WHERE id = $1::uuid`, t.id),
      ).rejects.toThrow(/already recorded/);
    });

    it('rejects DELETE and TRUNCATE', async () => {
      const t = await newTicket();
      await expect(
        db.$executeRawUnsafe(`DELETE FROM tickets WHERE id = $1::uuid`, t.id),
      ).rejects.toThrow(/append-only/);
      await expect(db.$executeRawUnsafe(`TRUNCATE tickets CASCADE`)).rejects.toThrow(/append-only/);
    });

    it('rejects a paid ticket without amount, lower-case plates and negative money', async () => {
      await expect(newTicket({ status: 'PAGO' })).rejects.toThrow(/tickets_paid_is_complete/);
      await expect(newTicket({ plate: 'a-1-tl' })).rejects.toThrow(/tickets_plate_upper_case/);
      await expect(newTicket({ tariffCentsPerHour: -1 })).rejects.toThrow(
        /tickets_money_non_negative/,
      );
    });

    it('rejects a duplicate serial', async () => {
      const t = await newTicket();
      await expect(newTicket({ serial: t.serial })).rejects.toThrow();
    });
  });

  describe('payments are append-only', () => {
    it('rejects UPDATE and DELETE', async () => {
      const t = await newTicket();
      await payTicket(t.id);
      const p = await db.payment.create({
        data: {
          id: randomUUID(),
          ticketId: t.id,
          receiptNo: `REC-${t.serial}`,
          amountCents: 100,
          method: 'CASH',
          receivedAt: new Date(),
          agentId,
        },
      });
      await expect(
        db.$executeRawUnsafe(`UPDATE payments SET amount_cents = 0 WHERE id = $1::uuid`, p.id),
      ).rejects.toThrow(/append-only/);
      await expect(
        db.$executeRawUnsafe(`DELETE FROM payments WHERE id = $1::uuid`, p.id),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe('tariffs keep their history (FR-28, BR-04)', () => {
    it('allows closing a period once, nothing else', async () => {
      const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
      const tariff = await db.tariff.create({
        data: {
          vehicleClassId: classId,
          centsPerHour: 50,
          validFrom: new Date('2020-01-01T00:00:00Z'),
          changedById: admin.id,
        },
      });
      await expect(
        db.$executeRawUnsafe(
          `UPDATE tariffs SET cents_per_hour = 75 WHERE id = $1::uuid`,
          tariff.id,
        ),
      ).rejects.toThrow(/add a new tariff/);

      await db.tariff.update({
        where: { id: tariff.id },
        data: { validUntil: new Date('2020-06-01T00:00:00Z') },
      });
      await expect(
        db.$executeRawUnsafe(
          `UPDATE tariffs SET valid_until = now() WHERE id = $1::uuid`,
          tariff.id,
        ),
      ).rejects.toThrow(/add a new tariff/);
      await expect(
        db.$executeRawUnsafe(`DELETE FROM tariffs WHERE id = $1::uuid`, tariff.id),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe('serial blocks never overlap (FR-08)', () => {
    it('rejects an overlapping block', async () => {
      const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
      await db.serialBlock.create({
        data: { deviceId, start: 9_000_000, end: 9_000_049, allocatedById: admin.id },
      });
      await expect(
        db.serialBlock.create({
          data: { deviceId, start: 9_000_040, end: 9_000_089, allocatedById: admin.id },
        }),
      ).rejects.toThrow(/serial_blocks_no_overlap/);
    });
  });
});
