// Histórico — every ticket the user may see, with filters (FR-18, FR-21).
import Link from 'next/link';
import {
  formatDiliDate,
  formatDiliTime,
  formatUsd,
  listTicketsResponseSchema,
  referenceResponseSchema,
} from '@estacionamento/shared';
import { AutoSubmitSelect } from '../../../components/client';
import { Filters, SearchField, filterValues } from '../../../components/filters';
import {
  Card,
  EmptyRow,
  PageHeader,
  Pagination,
  StatusPill,
  Table,
  Td,
} from '../../../components/ui';
import { api, qs } from '../../../lib/api';
import { diliToday } from '../../../lib/dates';
import { getT } from '../../../lib/i18n';
import { requireSession } from '../../../lib/session';

const LIMIT = 25;

export default async function HistoryPage({ searchParams }: PageProps<'/history'>) {
  const { token, user } = await requireSession(['supervisor', 'finance', 'auditor']);
  const { t } = await getT();
  const sp = await searchParams;
  const filters = filterValues(sp);
  const date = filters.date ?? diliToday();
  const q = typeof sp.q === 'string' && sp.q.trim() ? sp.q.trim() : undefined;
  const status = sp.status === 'ATIVO' || sp.status === 'PAGO' ? sp.status : undefined;
  const offset = Number(sp.offset) > 0 ? Number(sp.offset) : 0;

  const [reference, list] = await Promise.all([
    api('/reference', referenceResponseSchema, { token }),
    api(
      `/tickets${qs({ ...filters, date, q, status, limit: LIMIT, offset, order: 'newest' })}`,
      listTicketsResponseSchema,
      { token },
    ),
  ]);
  const area = (id: string) => reference.areas.find((a) => a.id === id)?.name ?? '—';
  const agent = (id: string) => reference.agents.find((a) => a.id === id)?.agentNumber ?? '—';
  const head = [
    t('monitor.col.ticket'),
    t('monitor.col.vehicle'),
    t('monitor.col.area'),
    t('monitor.col.entry'),
    t('monitor.col.exit'),
    t('monitor.col.agent'),
    t('payments.amount'),
    t('monitor.col.status'),
  ];

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={t('historyConsole.eyebrow')} title={t('nav.history')} />
      <Filters t={t} reference={reference} values={{ ...filters, date }}>
        <div className="min-w-48">
          <label htmlFor="f-status" className="mb-1 block text-sm text-muted">
            {t('common.status')}
          </label>
          <AutoSubmitSelect
            id="f-status"
            name="status"
            defaultValue={status ?? ''}
            className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold"
          >
            <option value="">{t('common.allStatuses')}</option>
            <option value="ATIVO">{t('status.ATIVO')}</option>
            <option value="PAGO">{t('status.PAGO')}</option>
          </AutoSubmitSelect>
        </div>
        <SearchField label={t('history.search')} value={q} />
      </Filters>

      <Card>
        <Table head={head}>
          {list.items.length === 0 ? <EmptyRow cols={head.length} text={t('common.none')} /> : null}
          {list.items.map((ticket) => (
            <tr key={ticket.id}>
              <Td className="font-mono text-blue">
                {ticket.status === 'PAGO' && user.role !== 'auditor' ? (
                  <Link href={`/tickets/${ticket.id}/receipt`} className="hover:underline">
                    {ticket.serial}
                  </Link>
                ) : (
                  ticket.serial
                )}
                <p className="text-xs text-muted">{ticket.lastEventRef}</p>
              </Td>
              <Td className="font-bold">{ticket.plate}</Td>
              <Td className="text-muted">{area(ticket.areaId)}</Td>
              <Td className="font-mono">
                {formatDiliDate(new Date(ticket.entryAt))} ·{' '}
                {formatDiliTime(new Date(ticket.entryAt))}
              </Td>
              <Td className="font-mono">
                {ticket.exitAt ? formatDiliTime(new Date(ticket.exitAt)) : '—'}
              </Td>
              <Td className="font-mono text-muted">{agent(ticket.agentId)}</Td>
              <Td className="font-semibold tabular-nums">
                {ticket.amountCents !== null
                  ? formatUsd(ticket.amountCents)
                  : t('history.inProgress')}
              </Td>
              <Td>
                <StatusPill label={t(ticket.status === 'ATIVO' ? 'status.ATIVO' : 'status.PAGO')} />
              </Td>
            </tr>
          ))}
        </Table>
        <Pagination
          path="/history"
          params={{ ...filters, date, q, status }}
          offset={offset}
          limit={LIMIT}
          total={list.total}
          labels={{
            previous: t('common.previous'),
            next: t('common.next'),
            range: `${list.total === 0 ? 0 : offset + 1}–${offset + list.items.length} / ${list.total}`,
          }}
        />
      </Card>
    </div>
  );
}
