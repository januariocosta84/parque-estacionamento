// Active tickets, oldest first, with time parked and "Registar saída" for supervisors (FR-23).
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatDiliTime, formatDuration } from '@estacionamento/shared';
import type { ReferenceResponse, TicketListItem } from '@estacionamento/shared';
import { minutesBetween } from '../lib/dates';
import type { T } from '../lib/i18n';
import { EmptyRow, StatusPill, Table, Td } from './ui';

export function ActiveTicketsTable({
  t,
  tickets,
  reference,
  locale,
  canRecordExit,
}: {
  t: T;
  tickets: TicketListItem[];
  reference: ReferenceResponse;
  locale: 'pt' | 'tet';
  canRecordExit: boolean;
}) {
  const now = new Date();
  const area = (id: string) => reference.areas.find((a) => a.id === id)?.name ?? '—';
  const agent = (id: string) => reference.agents.find((a) => a.id === id)?.agentNumber ?? '—';
  const vehicle = (id: string) => {
    const c = reference.vehicleClasses.find((v) => v.id === id);
    return c ? (locale === 'tet' ? c.nameTet : c.namePt) : '';
  };
  const head = [
    t('monitor.col.ticket'),
    t('monitor.col.vehicle'),
    t('monitor.col.area'),
    t('monitor.col.entry'),
    t('monitor.col.duration'),
    t('monitor.col.agent'),
    t('monitor.col.status'),
    ...(canRecordExit ? [t('monitor.col.action')] : []),
  ];

  return (
    <Table head={head}>
      {tickets.length === 0 ? <EmptyRow cols={head.length} text={t('monitor.noActive')} /> : null}
      {tickets.map((ticket) => (
        <tr key={ticket.id}>
          <Td className="font-mono text-blue">{ticket.serial}</Td>
          <Td>
            <p className="font-bold">{ticket.plate}</p>
            <p className="text-sm text-muted">{vehicle(ticket.vehicleClassId)}</p>
          </Td>
          <Td className="whitespace-nowrap text-muted">{area(ticket.areaId)}</Td>
          <Td className="whitespace-nowrap font-mono">
            {formatDiliTime(new Date(ticket.entryAt))}
          </Td>
          <Td className="whitespace-nowrap font-mono">
            {formatDuration(minutesBetween(ticket.entryAt, now))}
          </Td>
          <Td className="whitespace-nowrap font-mono text-muted">{agent(ticket.agentId)}</Td>
          <Td>
            <StatusPill label={t('status.ATIVO')} />
          </Td>
          {canRecordExit ? (
            <Td>
              <Link
                href={`/tickets/${ticket.id}/exit`}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-line px-4 py-2 font-semibold text-red hover:bg-red-soft"
              >
                {t('monitor.recordExit')}
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </Td>
          ) : null}
        </tr>
      ))}
    </Table>
  );
}
