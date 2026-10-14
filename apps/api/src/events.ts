// Every action writes an Event (CLAUDE.md rule 5). The table is append-only in PostgreSQL.
import { randomUUID } from 'node:crypto';
import type { Prisma } from './generated/prisma/client';
import type { EventType } from './generated/prisma/enums';

type Tx = Pick<Prisma.TransactionClient, 'event'>;

export interface NewEvent {
  type: EventType;
  userId: string;
  deviceId?: string | null;
  ticketId?: string | null;
  details?: Prisma.InputJsonObject;
  /** Server clock unless the event came from a device (BR-09). */
  at?: Date;
  /** Client-generated for events created on a phone (idempotent sync). */
  id?: string;
}

export function writeEvent(db: Tx, event: NewEvent) {
  return db.event.create({
    data: {
      id: event.id ?? randomUUID(),
      type: event.type,
      at: event.at ?? new Date(),
      userId: event.userId,
      deviceId: event.deviceId ?? null,
      ticketId: event.ticketId ?? null,
      details: event.details ?? {},
    },
  });
}
