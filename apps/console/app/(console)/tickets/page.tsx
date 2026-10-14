// Títulos ativos — every parked vehicle in the supervisor's areas, oldest first (FR-23).
import { listTicketsResponseSchema, referenceResponseSchema } from '@estacionamento/shared';
import { ActiveTicketsTable } from '../../../components/active-table';
import { AutoRefresh } from '../../../components/client';
import { Filters, SearchField, filterValues } from '../../../components/filters';
import { Card, PageHeader, Pagination } from '../../../components/ui';
import { api, qs } from '../../../lib/api';
import { getT } from '../../../lib/i18n';
import { requireSession } from '../../../lib/session';

const LIMIT = 20;

export default async function ActiveTicketsPage({ searchParams }: PageProps<'/tickets'>) {
  const { token } = await requireSession(['supervisor']);
  const { t, locale } = await getT();
  const sp = await searchParams;
  const filters = filterValues(sp);
  const q = typeof sp.q === 'string' && sp.q.trim() ? sp.q.trim() : undefined;
  const offset = Number(sp.offset) > 0 ? Number(sp.offset) : 0;

  const [reference, list] = await Promise.all([
    api('/reference', referenceResponseSchema, { token }),
    api(
      `/tickets${qs({ status: 'ATIVO', order: 'oldest', limit: LIMIT, offset, q, areaId: filters.areaId, agentId: filters.agentId })}`,
      listTicketsResponseSchema,
      { token },
    ),
  ]);

  return (
    <div className="grid gap-6">
      <AutoRefresh seconds={60} />
      <PageHeader eyebrow={t('tickets.eyebrow')} title={t('nav.activeTickets')} />
      <Filters t={t} reference={reference} values={filters} showDate={false}>
        <SearchField label={t('history.search')} value={q} />
      </Filters>
      <Card>
        <ActiveTicketsTable
          t={t}
          tickets={list.items}
          reference={reference}
          locale={locale}
          canRecordExit
        />
        <Pagination
          path="/tickets"
          params={{ ...filters, q }}
          offset={offset}
          limit={LIMIT}
          total={list.total}
          labels={{
            previous: t('common.previous'),
            next: t('common.next'),
            range: t('monitor.pageRange', {
              from: list.total === 0 ? 0 : offset + 1,
              to: offset + list.items.length,
              total: list.total,
            }),
          }}
        />
      </Card>
    </div>
  );
}
