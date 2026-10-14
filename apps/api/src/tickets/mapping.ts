import { TICKET_EVENT_SLOT, parseSerial, ticketEventRef } from '@estacionamento/shared';
import type { Receipt, Ticket, TicketView } from '@estacionamento/shared';
import type { Payment, Ticket as TicketRow, User } from '../generated/prisma/client';

export const ALL_COPIES: TicketView['copies'] = ['WHITE', 'YELLOW', 'RED'];

export function serialNumberOf(serial: string): number {
  const n = parseSerial(serial);
  if (n === null) throw new Error(`Stored serial "${serial}" is invalid`);
  return n;
}

export function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    serial: row.serial,
    plate: row.plate,
    vehicleClassId: row.vehicleClassId,
    areaId: row.areaId,
    agentId: row.agentId,
    deviceId: row.deviceId,
    entryAt: row.entryAt.toISOString(),
    exitAt: row.exitAt?.toISOString() ?? null,
    hoursCharged: row.hoursCharged,
    tariffCentsPerHour: row.tariffCentsPerHour,
    amountCents: row.amountCents,
    status: row.status,
    driverPhone: row.driverPhone,
  };
}

export function toTicketView(row: TicketRow): TicketView {
  return {
    ticket: toTicket(row),
    issueRef: ticketEventRef(serialNumberOf(row.serial), TICKET_EVENT_SLOT.ISSUE),
    copies: ALL_COPIES,
  };
}

export function toReceipt(
  row: TicketRow,
  payment: Payment & { agent: Pick<User, 'id' | 'name' | 'agentNumber'> },
  paymentEventDetails: unknown,
): Receipt {
  if (!row.exitAt || row.hoursCharged === null || row.amountCents === null) {
    throw new Error(`Ticket ${row.serial} is paid but has no exit data`);
  }
  const details = (paymentEventDetails ?? {}) as { receivedCents?: number; changeCents?: number };
  return {
    ticketId: row.id,
    receiptNo: payment.receiptNo,
    serial: row.serial,
    plate: row.plate,
    vehicleClassId: row.vehicleClassId,
    entryAt: row.entryAt.toISOString(),
    exitAt: row.exitAt.toISOString(),
    hoursCharged: row.hoursCharged,
    tariffCentsPerHour: row.tariffCentsPerHour,
    amountCents: row.amountCents,
    receivedCents: details.receivedCents ?? payment.amountCents,
    changeCents: details.changeCents ?? 0,
    method: payment.method,
    agent: {
      id: payment.agent.id,
      name: payment.agent.name,
      agentNumber: payment.agent.agentNumber,
    },
    paymentRef: ticketEventRef(serialNumberOf(row.serial), TICKET_EVENT_SLOT.PAYMENT),
    paidAt: payment.receivedAt.toISOString(),
  };
}
