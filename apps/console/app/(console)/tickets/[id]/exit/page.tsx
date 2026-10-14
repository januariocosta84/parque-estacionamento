// Registar saída from the console (FR-23): exit time from the clock, charge, cash received.
import Link from 'next/link';
import {
  chargeQuoteSchema,
  formatDiliDate,
  formatDiliTime,
  formatDuration,
  formatHours,
  formatUsd,
  ticketViewSchema,
} from '@estacionamento/shared';
import { ActionForm } from '../../../../../components/client';
import {
  Card,
  InfoNote,
  PageHeader,
  StatusPill,
  inputClass,
  labelClass,
} from '../../../../../components/ui';
import { ApiError, api } from '../../../../../lib/api';
import { errorMessage, getT } from '../../../../../lib/i18n';
import { requireSession } from '../../../../../lib/session';
import { recordExitAction } from '../../actions';

export default async function ConsoleExitPage({ params }: PageProps<'/tickets/[id]/exit'>) {
  const { token } = await requireSession(['supervisor']);
  const { t, locale } = await getT();
  const { id } = await params;

  let view, quote;
  try {
    [view, quote] = await Promise.all([
      api(`/tickets/${id}`, ticketViewSchema, { token }),
      api(`/tickets/${id}/charge`, chargeQuoteSchema, { token }),
    ]);
  } catch (err) {
    return (
      <div className="grid gap-6">
        <PageHeader eyebrow={t('exit.eyebrow')} title={t('exit.title')} />
        <InfoNote tone="red">{errorMessage(t, err)}</InfoNote>
        {err instanceof ApiError && err.code === 'ALREADY_PAID' ? (
          <Link className="font-semibold text-red underline" href={`/tickets/${id}/receipt`}>
            {t('receipt.heading')}
          </Link>
        ) : null}
      </div>
    );
  }

  const { ticket } = view;
  const exitAt = new Date(quote.exitAt);
  const rows: [string, string][] = [
    [t('exit.entry'), formatDiliTime(new Date(quote.entryAt))],
    [t('exit.timeParked'), formatDuration(quote.durationMinutes)],
    [t('exit.hoursCharged'), formatHours(locale, quote.hoursCharged)],
    [t('exit.tariff'), t('unit.perHour', { amount: formatUsd(quote.tariffCentsPerHour) })],
    [t('exit.paymentMethod'), t('payment.CASH')],
  ];

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader eyebrow={t('exit.eyebrow')} title={t('exit.title')} />
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-2xl font-extrabold">{ticket.plate}</p>
          <p className="font-mono text-blue">{ticket.serial}</p>
        </div>
        <StatusPill label={t('status.ATIVO')} />
      </Card>

      <Card>
        <p className="mb-3 font-semibold">{t('exit.exitOn', { date: formatDiliDate(exitAt) })}</p>
        <p className="mb-4 font-mono text-3xl">{formatDiliTime(exitAt)}</p>
        <dl className="grid">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-t border-line py-3">
              <dt className="text-muted">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-yellow p-6">
        <div>
          <p className="text-lg font-bold">{t('exit.totalDue')}</p>
          <p className="font-mono">
            {t('exit.hoursTimesTariff', {
              hours: quote.hoursCharged,
              tariff: formatUsd(quote.tariffCentsPerHour),
            })}
          </p>
        </div>
        <p className="text-5xl font-extrabold tabular-nums">{formatUsd(quote.amountCents)}</p>
      </div>

      <Card>
        <ActionForm action={recordExitAction} submit={t('exit.confirm')} className="grid gap-4">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <input type="hidden" name="expectedAmountCents" value={quote.amountCents} />
          <div className="max-w-xs">
            <label htmlFor="received" className={labelClass}>
              {t('exit.received')}
            </label>
            <input
              id="received"
              name="received"
              inputMode="decimal"
              defaultValue={formatUsd(quote.amountCents).replace('$', '')}
              className={`${inputClass} font-mono text-xl`}
            />
          </div>
        </ActionForm>
      </Card>
      <InfoNote>{t('exit.ruleNote')}</InfoNote>
    </div>
  );
}
