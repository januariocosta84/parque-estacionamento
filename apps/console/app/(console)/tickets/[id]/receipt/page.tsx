// Pagamento recebido — the receipt (FR-16).
import Link from 'next/link';
import { Check } from 'lucide-react';
import { formatDiliDate, formatDiliTime, formatUsd, receiptSchema } from '@estacionamento/shared';
import { Card, InfoNote, PageHeader, StatusPill, buttonClass } from '../../../../../components/ui';
import { api } from '../../../../../lib/api';
import { errorMessage, getT } from '../../../../../lib/i18n';
import { requireSession } from '../../../../../lib/session';

export default async function ConsoleReceiptPage({ params }: PageProps<'/tickets/[id]/receipt'>) {
  const { token } = await requireSession(['supervisor', 'finance', 'auditor']);
  const { t } = await getT();
  const { id } = await params;

  let receipt;
  try {
    receipt = await api(`/tickets/${id}/receipt`, receiptSchema, { token });
  } catch (err) {
    return (
      <div className="grid gap-6">
        <PageHeader eyebrow={t('receipt.eyebrow')} title={t('receipt.title')} />
        <InfoNote tone="red">{errorMessage(t, err)}</InfoNote>
      </div>
    );
  }

  const entry = new Date(receipt.entryAt);
  const exit = new Date(receipt.exitAt);
  const rows: [string, string][] = [
    [t('receipt.date'), formatDiliDate(exit)],
    [t('receipt.entryExit'), `${formatDiliTime(entry)} / ${formatDiliTime(exit)}`],
    [
      t('receipt.hoursCharged'),
      `${receipt.hoursCharged} h · ${formatUsd(receipt.tariffCentsPerHour)}/h`,
    ],
    [t('receipt.method'), t('payment.CASH')],
    [t('receipt.amountReceived'), `${formatUsd(receipt.receivedCents)} USD`],
    ...(receipt.changeCents > 0
      ? [[t('receipt.change'), `${formatUsd(receipt.changeCents)} USD`] as [string, string]]
      : []),
    [
      t('receipt.agent'),
      [receipt.agent.name, receipt.agent.agentNumber].filter(Boolean).join(' · '),
    ],
  ];

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader eyebrow={t('receipt.eyebrow')} title={t('receipt.title')} />
      <div className="flex items-center gap-5">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-green-soft text-green">
          <Check aria-hidden className="h-9 w-9" />
        </span>
        <div>
          <p className="text-5xl font-extrabold text-green tabular-nums">
            {formatUsd(receipt.amountCents)}
          </p>
          <p className="font-semibold text-green">{t('receipt.receivedClosed')}</p>
        </div>
      </div>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">{t('receipt.heading')}</h2>
          <StatusPill label={t('status.PAGO')} />
        </div>
        <p className="mt-3 font-mono text-xl text-blue">{receipt.serial}</p>
        <p className="font-bold">{receipt.plate}</p>
        <dl className="mt-4 grid">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-t border-line py-3">
              <dt className="text-muted">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted">
          {t('receipt.registeredAt', { time: formatDiliTime(exit) })}
        </p>
        <p className="font-mono text-blue">
          {receipt.paymentRef} · {receipt.receiptNo}
        </p>
      </Card>
      <Link href="/monitor" className={`${buttonClass.dark} w-fit`}>
        {t('receipt.backHome')}
      </Link>
    </div>
  );
}
