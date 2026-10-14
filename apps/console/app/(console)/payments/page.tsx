// Pagamentos — daily revenue per agent and per area (FR-25).
import {
  dailyReportResponseSchema,
  formatDiliDayLong,
  formatUsd,
  referenceResponseSchema,
} from '@estacionamento/shared';
import { Filters, filterValues } from '../../../components/filters';
import { Card, CardTitle, EmptyRow, PageHeader, StatCard, Table, Td } from '../../../components/ui';
import { api, qs } from '../../../lib/api';
import { diliToday } from '../../../lib/dates';
import { getT } from '../../../lib/i18n';
import { requireSession } from '../../../lib/session';

export default async function PaymentsPage({ searchParams }: PageProps<'/payments'>) {
  const { token } = await requireSession(['supervisor', 'finance', 'auditor']);
  const { t, locale } = await getT();
  const filters = filterValues(await searchParams);
  const date = filters.date ?? diliToday();

  const [reference, report] = await Promise.all([
    api('/reference', referenceResponseSchema, { token }),
    api(`/reports/daily${qs({ ...filters, date })}`, dailyReportResponseSchema, { token }),
  ]);
  const day = formatDiliDayLong(locale, new Date(`${date}T12:00:00+09:00`));

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={t('payments.eyebrow')} title={`${t('payments.title')} · ${day}`} />
      <Filters t={t} reference={reference} values={{ ...filters, date }} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          highlight
          label={t('payments.total')}
          value={formatUsd(report.total.amountCents)}
          note="USD"
        />
        <StatCard label={t('payments.count')} value={String(report.total.payments)} />
        <StatCard label={t('payments.issued')} value={String(report.total.issued)} />
        <StatCard label={t('payments.stillParked')} value={String(report.total.stillParked)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle>{t('payments.byAgent')}</CardTitle>
          <Table
            head={[
              t('monitor.col.agent'),
              t('admin.name'),
              t('payments.count'),
              t('payments.amount'),
            ]}
          >
            {report.byAgent.length === 0 ? <EmptyRow cols={4} text={t('common.none')} /> : null}
            {report.byAgent.map((a) => (
              <tr key={a.agentId}>
                <Td className="font-mono">{a.agentNumber ?? '—'}</Td>
                <Td>{a.name}</Td>
                <Td className="tabular-nums">{a.payments}</Td>
                <Td className="font-semibold tabular-nums">{formatUsd(a.amountCents)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card>
          <CardTitle>{t('payments.byArea')}</CardTitle>
          <Table head={[t('monitor.col.area'), t('payments.count'), t('payments.amount')]}>
            {report.byArea.length === 0 ? <EmptyRow cols={3} text={t('common.none')} /> : null}
            {report.byArea.map((a) => (
              <tr key={a.areaId}>
                <Td>{a.name}</Td>
                <Td className="tabular-nums">{a.payments}</Td>
                <Td className="font-semibold tabular-nums">{formatUsd(a.amountCents)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
      <p className="text-sm text-muted">{t('currencyNote')}</p>
    </div>
  );
}
