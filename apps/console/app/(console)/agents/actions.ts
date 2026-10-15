'use server';
// Supervisor actions on agents: new PIN + unlock (FR-03), block a lost phone (FR-05).
// The API checks the role and the supervisor's areas again, and logs both as ADMIN_CHANGE.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '../../../components/client';
import { api } from '../../../lib/api';
import { errorMessage, getT } from '../../../lib/i18n';
import { requireSession } from '../../../lib/session';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function post(path: string, body: unknown, done: string): Promise<FormState> {
  const { token } = await requireSession(['supervisor', 'admin']);
  const { t } = await getT();
  try {
    await api(path, z.any(), { method: 'POST', token, body });
  } catch (err) {
    return { error: errorMessage(t, err) };
  }
  revalidatePath('/agents');
  return { ok: true, message: done };
}

export async function resetPinAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getT();
  const id = z.uuid().parse(fd.get('userId'));
  return post(
    `/users/${id}/reset-pin`,
    { pin: str(fd, 'pin'), reason: str(fd, 'reason') },
    t('agents.pinDone'),
  );
}

export async function blockDeviceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getT();
  const id = z.uuid().parse(fd.get('deviceId'));
  return post(`/devices/${id}/block`, { reason: str(fd, 'reason') }, t('agents.blockDone'));
}
