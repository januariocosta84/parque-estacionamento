// Auditoria — the append-only event log (FR-26, NFR-07).
import {
  eventTypeSchema,
  formatDiliDate,
  formatDiliTime,
  formatUsd,
  listEventsResponseSchema,
  referenceResponseSchema,
} from '@estacionamento/shared';
import type { MessageKey } from '@estacionamento/shared';
import { AutoSubmitSelect } from '../../../components/client';
import { Filters, SearchField, filterValues } from '../../../components/filters';
import {
  Card,
  EmptyRow,
  InfoNote,
  PageHeader,
  Pagination,
  Table,
  Td,
} from '../../../components/ui';
import { api, qs } from '../../../lib/api';
import { getT } from '../../../lib/i18n';
import { requireSession } from '../../../lib/session';

const LIMIT = 50;

/** A short, readable summary of an event's details. */
// Shown in other columns, or internal: left out of the summary.
const HIDDEN = new Set(['copies', 'chargingRule', 'serial', 'plate', 'receiptNo', 'exitAt']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function value(key: string, v: unknown): string {
  if (typeof v === 'number' && /Cents(PerHour)?$/.test(key)) return formatUsd(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function summary(details: Record<string, unknown>): string {
  return Object.entries(details)
    .filter(
      ([k, v]) =>
        v !== null &&
        v !== undefined &&
        !HIDDEN.has(k) &&
        !/Id$/.test(k) &&
        !(typeof v === 'string' && UUID.test(v)),
    )
    .map(([k, v]) => `${k}: ${value(k, v)}`)
    .join(' · ');
}

export default async function AuditPage({ searchParams }: PageProps<'/audit'>) {
  const { token } = await requireSession(['supervisor', 'auditor', 'admin']);
  const { t } = await getT();
  const sp = await searchParams;
  const filters = filterValues(sp);
  const type = eventTypeSchema.safeParse(sp.type).data;
  const q = typeof sp.q === 'string' && sp.q.trim() ? sp.q.trim() : undefined;
  const offset = Number(sp.offset) > 0 ? Number(sp.offset) : 0;

  const [reference, events] = await Promise.all([
    api('/reference', referenceResponseSchema, { token }),
    api(`/events${qs({ ...filters, type, q, limit: LIMIT, offset })}`, listEventsResponseSchema, {
      token,
    }),
  ]);
  const head = [
    t('audit.col.time'),
    t('audit.col.ref'),
    t('audit.col.type'),
    t('audit.col.user'),
    t('audit.col.ticket'),
    t('audit.col.details'),
  ];

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={t('audit.eyebrow')} title={t('audit.title')} />
      <InfoNote>{t('audit.appendOnly')}</InfoNote>
      <Filters t={t} reference={reference} values={filters}>
        <div className="min-w-56">
          <label htmlFor="f-type" className="mb-1 block text-sm text-muted">
            {t('audit.type')}
          </label>
          <AutoSubmitSelect
            id="f-type"
            name="type"
            defaultValue={type ?? ''}
            className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold"
          >
            <option value="">{t('audit.allTypes')}</option>
            {eventTypeSchema.options.map((o) => (
              <option key={o} value={o}>
                {t(`event.${o}` as MessageKey)}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <SearchField label={t('history.search')} value={q} />
      </Filters>

      <Card>
        <Table head={head}>
          {events.items.length === 0 ? (
            <EmptyRow cols={head.length} text={t('common.none')} />
          ) : null}
          {events.items.map((e) => {
            const at = new Date(e.at);
            return (
              <tr key={e.id}>
                <Td className="whitespace-nowrap font-mono">
                  {formatDiliDate(at)} {formatDiliTime(at)}
                </Td>
                <Td className="whitespace-nowrap font-mono text-blue">{e.ref}</Td>
                <Td className="font-semibold">{t(`event.${e.type}` as MessageKey)}</Td>
                <Td>
                  <p>{e.user.name}</p>
                  <p className="font-mono text-sm text-muted">
                    {e.user.agentNumber ?? e.user.username}
                  </p>
                </Td>
                <Td>
                  {e.ticket ? (
                    <>
                      <p className="font-bold">{e.ticket.plate}</p>
                      <p className="font-mono text-sm text-blue">{e.ticket.serial}</p>
                    </>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td className="max-w-md break-words text-sm text-muted">{summary(e.details)}</Td>
              </tr>
            );
          })}
        </Table>
        <Pagination
          path="/audit"
          params={{ ...filters, type, q }}
          offset={offset}
          limit={LIMIT}
          total={events.total}
          labels={{
            previous: t('common.previous'),
            next: t('common.next'),
            range: `${events.total === 0 ? 0 : offset + 1}–${offset + events.items.length} / ${events.total}`,
          }}
        />
      </Card>
    </div>
  );
}
