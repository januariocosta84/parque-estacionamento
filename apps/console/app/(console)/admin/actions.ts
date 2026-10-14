'use server';
// Admin actions (FR-28). The API checks the admin role again and logs every change.
import { revalidatePath } from 'next/cache';
import {
  adminUserSchema,
  areaSchema,
  parseUsdInput,
  tariffSchema,
  vehicleClassSchema,
} from '@estacionamento/shared';
import type { ZodType } from 'zod';
import type { FormState } from '../../../components/client';
import { api } from '../../../lib/api';
import { errorMessage, getT } from '../../../lib/i18n';
import { requireSession } from '../../../lib/session';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function send<T>(path: string, schema: ZodType<T>, body: unknown): Promise<FormState> {
  const { token } = await requireSession(['admin']);
  const { t } = await getT();
  try {
    await api(path, schema, { method: 'POST', token, body });
  } catch (err) {
    return { error: errorMessage(t, err) };
  }
  revalidatePath('/admin');
  return { ok: true, message: t('common.saved') };
}

export async function createUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const role = str(fd, 'role');
  const areaIds = fd.getAll('areaIds').map(String);
  const phone = str(fd, 'phone');
  const body =
    role === 'agent'
      ? {
          role,
          name: str(fd, 'name'),
          agentNumber: str(fd, 'agentNumber'),
          pin: str(fd, 'pin'),
          areaIds,
          ...(phone ? { phone } : {}),
        }
      : {
          role,
          name: str(fd, 'name'),
          username: str(fd, 'username'),
          password: String(fd.get('password') ?? ''),
          phone,
          areaIds,
        };
  return send('/admin/users', adminUserSchema, body);
}

export async function updateUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, 'id');
  const status = str(fd, 'status');
  const body: Record<string, unknown> = { reason: str(fd, 'reason') };
  if (status === 'ACTIVE' || status === 'LOCKED') body.status = status;
  if (fd.has('areas')) body.areaIds = fd.getAll('areaIds').map(String);
  return send(`/admin/users/${id}`, adminUserSchema, body);
}

export async function createAreaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return send('/admin/areas', areaSchema, { name: str(fd, 'name') });
}

export async function toggleAreaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return send(`/admin/areas/${str(fd, 'id')}`, areaSchema, {
    active: str(fd, 'active') === 'true',
  });
}

export async function createClassAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return send('/admin/vehicle-classes', vehicleClassSchema, {
    code: str(fd, 'code'),
    namePt: str(fd, 'namePt'),
    nameTet: str(fd, 'nameTet'),
  });
}

export async function toggleClassAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return send(`/admin/vehicle-classes/${str(fd, 'id')}`, vehicleClassSchema, {
    active: str(fd, 'active') === 'true',
  });
}

export async function setTariffAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const cents = parseUsdInput(str(fd, 'amount'));
  if (cents === null) {
    const { t } = await getT();
    return { error: t('error.INVALID_AMOUNT') };
  }
  return send('/admin/tariffs', tariffSchema, {
    vehicleClassId: str(fd, 'vehicleClassId'),
    centsPerHour: cents,
    reason: str(fd, 'reason'),
  });
}
