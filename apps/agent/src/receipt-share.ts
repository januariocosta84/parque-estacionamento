// Plain-text copy of a receipt for the driver, sent through the phone's share sheet
// (WhatsApp, SMS, …). Built on the phone, so it works offline.
import { formatDiliDate, formatDiliTime, formatUsd } from '@estacionamento/shared';
import type { MessageKey, MessageParams, Receipt } from '@estacionamento/shared';

type Translate = (key: MessageKey, params?: MessageParams) => string;

export function receiptShareText(
  receipt: Receipt,
  vehicleName: string | undefined,
  t: Translate,
): string {
  const entry = new Date(receipt.entryAt);
  const exit = new Date(receipt.exitAt);
  const line = (key: MessageKey, value: string) => `${t(key)}: ${value}`;
  return [
    `${t('appName')} · ${t('authorityName')}`,
    `${t('receipt.heading')} ${receipt.receiptNo}`,
    '',
    line('receipt.serial', receipt.serial),
    line('receipt.plate', vehicleName ? `${receipt.plate} · ${vehicleName}` : receipt.plate),
    line('receipt.date', formatDiliDate(exit)),
    line('receipt.entryExit', `${formatDiliTime(entry)} / ${formatDiliTime(exit)}`),
    line(
      'receipt.hoursCharged',
      `${receipt.hoursCharged} h · ${formatUsd(receipt.tariffCentsPerHour)}/h`,
    ),
    line('receipt.totalPaid', `${formatUsd(receipt.amountCents)} USD`),
    line('receipt.method', t(`payment.${receipt.method}`)),
    line('receipt.agent', `${receipt.agent.name} · ${receipt.agent.agentNumber ?? ''}`),
    line('receipt.ref', receipt.paymentRef),
  ].join('\n');
}
