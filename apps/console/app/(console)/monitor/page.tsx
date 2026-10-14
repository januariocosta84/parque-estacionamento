// Monitorização em tempo real (FR-20, FR-21, FR-23). Design: docs/screens/07-console-monitorizacao.png
// The hourly chart (FR-22) and alerts (FR-24) are Release 2.
import Link from 'next/link';
import { ArrowRight, Car, LogOut as ExitIcon, Ticket, Wallet } from 'lucide-react';
import {
  formatDiliDate,
  formatDiliTime,
  formatUsd,
  listEventsResponseSchema,
  listTicketsResponseSchema,
  monitorResponseSchema,
  referenceResponseSchema,
} from '@estacionamento/shared';
import type { MessageKey } from '@estacionamento/shared';
import { ActiveTicketsTable } from '../../../components/active-table';
import { AutoRefresh, RefreshButton } from '../../../components/client';
import { Filters, filterValues } from '../../../components/filters';
import { Card, CardTitle, PageHeader, StatCard, StatusPill } from '../../../components/ui';
import { api, qs } from '../../../lib/api';
import { diliToday } from '../../../lib/dates';
import { getT } from '../../../lib/i18n';
import { requireSession } from '../../../lib/session';

export default async function MonitorPage({ searchParams }: PageProps<'/monitor'>) {
  const { token, user } = await requireSession(['supervisor', 'finance', 'auditor']);
  const { t, locale } = await getT();
  const filters = filterValues(await searchParams);
  const date = filters.date ?? diliToday();
  const canSeeEvents = user.role !== 'finance';

  const [reference, monitor, active, events] = await Promise.all([
    api('/reference', referenceResponseSchema, { token }),
    api(`/monitor${qs({ ...filters, date })}`, monitorResponseSchema, { token }),
    api(
      `/tickets${qs({ status: 'ATIVO', order: 'oldest', limit: 6, areaId: filters.areaId, agentId: filters.agentId })}`,
      listTicketsResponseSchema,
      { token },
    ),
    canSeeEvents
      ? api(
          `/events${qs({ limit: 5, areaId: filters.areaId, agentId: filters.agentId })}`,
          listEventsResponseSchema,
          { token },
        )
      : Promise.resolve(null),
  ]);

  const className = (id: string) => {
    const c = reference.vehicleClasses.find((v) => v.id === id);
    return c ? (locale === 'tet' ? c.nameTet : c.namePt) : '';
  };
  const generatedAt = new Date(monitor.generatedAt);

  return (
    <div className="grid gap-6">
      <AutoRefresh seconds={60} />
      <PageHeader
        eyebrow={t('monitor.eyebrow')}
        title={t('monitor.title')}
        right={
          <div className="flex items-center gap-4">
            <div className="text-right text-sm text-muted">
              <p>{t('monitor.lastUpdate')}</p>
              <p className="font-mono text-base text-ink">
                {formatDiliDate(generatedAt)} · {formatDiliTime(generatedAt)}
              </p>
            </div>
            <RefreshButton label={t('monitor.refresh')} />
          </div>
        }
      />

      <Filters t={t} reference={reference} values={{ ...filters, date }} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('monitor.parkedVehicles')}
          value={String(monitor.parked.count)}
          note={monitor.parked.byClass
            .map((g) => `${g.count} ${className(g.vehicleClassId)}`)
            .join(' · ')}
          icon={<Car className="h-6 w-6" />}
        />
        <StatCard
          highlight
          label={t('monitor.receivedToday')}
          value={formatUsd(monitor.received.amountCents)}
          note={`${t('monitor.paymentsCount', { count: monitor.received.payments })} · USD`}
          icon={<Wallet className="h-6 w-6" />}
        />
        <StatCard
          label={t('monitor.issuedToday')}
          value={String(monitor.issued.count)}
          note={t('monitor.issuedBreakdown', {
            active: monitor.issued.active,
            paid: monitor.issued.paid,
          })}
          icon={<Ticket className="h-6 w-6" />}
        />
        <StatCard
          label={t('monitor.exits')}
          value={String(monitor.exits)}
          note={t('monitor.exitsBreakdown', { count: monitor.exits })}
          icon={<ExitIcon className="h-6 w-6" />}
        />
      </div>

      <div
        className={`grid gap-6 ${canSeeEvents ? '2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}
      >
        <Card>
          <CardTitle
            right={
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill label={t('monitor.inProgressCount', { count: monitor.parked.count })} />
                <span className="text-sm text-muted">{t('monitor.oldestFirst')}</span>
              </div>
            }
          >
            {t('monitor.activeTickets')}
          </CardTitle>
          <ActiveTicketsTable
            t={t}
            tickets={active.items}
            reference={reference}
            locale={locale}
            canRecordExit={user.role === 'supervisor'}
          />
          {user.role === 'supervisor' ? (
            <div className="mt-4 flex justify-end">
              <Link
                href="/tickets"
                className="inline-flex items-center gap-2 font-semibold text-red hover:underline"
              >
                {t('monitor.seeAllTickets')}
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </Card>

        {events ? (
          <Card>
            <CardTitle>{t('monitor.recentActivity')}</CardTitle>
            <p className="-mt-3 mb-4 text-sm text-muted">{t('monitor.recentActivitySub')}</p>
            <ul className="grid">
              {events.items.map((e) => (
                <li key={e.id} className="grid gap-0.5 border-t border-line py-4 first:border-t-0">
                  <div className="flex justify-between gap-3">
                    <p className="font-bold">{t(`event.${e.type}` as MessageKey)}</p>
                    <p className="font-mono text-sm text-muted">{formatDiliTime(new Date(e.at))}</p>
                  </div>
                  {e.ticket ? <p className="font-mono text-blue">{e.ticket.serial}</p> : null}
                  <p className="text-sm text-muted">
                    {[e.ticket?.plate, e.user.agentNumber ?? e.user.username]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="font-mono text-sm text-muted">{e.ref}</p>
                </li>
              ))}
            </ul>
            <Link
              href="/audit"
              className="mt-2 inline-flex items-center gap-2 font-semibold text-red hover:underline"
            >
              {t('monitor.fullHistory')}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </Card>
        ) : null}
      </div>

      <p className="text-sm text-muted">{t('currencyNote')}</p>
    </div>
  );
}
