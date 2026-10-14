'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { parseUsdInput, receiptSchema } from '@estacionamento/shared';
import { z } from 'zod';
import type { FormState } from '../../../components/client';
import { api } from '../../../lib/api';
import { errorMessage, getT } from '../../../lib/i18n';
import { requireSession } from '../../../lib/session';

/** FR-23: a supervisor records exit and cash payment in one step (docs/DECISIONS.md). */
export async function recordExitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { token } = await requireSession(['supervisor']);
  const { t } = await getT();
  const ticketId = z.uuid().parse(formData.get('ticketId'));
  const expectedAmountCents = Number(formData.get('expectedAmountCents'));
  const receivedCents = parseUsdInput(String(formData.get('received') ?? ''));
  if (receivedCents === null) return { error: t('error.INVALID_AMOUNT') };

  try {
    await api(`/tickets/${ticketId}/exit`, receiptSchema, {
      method: 'POST',
      token,
      body: { paymentId: crypto.randomUUID(), method: 'CASH', expectedAmountCents, receivedCents },
    });
  } catch (err) {
    // CHARGE_CHANGED: the page re-renders with the new quote; the message gives the new total.
    revalidatePath(`/tickets/${ticketId}/exit`);
    return { error: errorMessage(t, err) };
  }
  revalidatePath('/monitor');
  redirect(`/tickets/${ticketId}/receipt`);
}
