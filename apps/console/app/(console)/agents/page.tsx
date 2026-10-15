// Agentes — the supervisor's agents: unlock with a new PIN (FR-03), block a lost phone (FR-05).
import {
  agentsResponseSchema,
  formatDiliDate,
  formatDiliTime,
  referenceResponseSchema,
} from '@estacionamento/shared';
import type { MessageKey } from '@estacionamento/shared';
import { ActionForm } from '../../../components/client';
import { Card, InfoNote, PageHeader, StatusPill, inputClass } from '../../../components/ui';
import { api } from '../../../lib/api';
import { getT } from '../../../lib/i18n';
import { requireSession } from '../../../lib/session';
import { blockDeviceAction, resetPinAction } from './actions';

export default async function AgentsPage() {
  const { token } = await requireSession(['supervisor', 'admin']);
  const { t } = await getT();
  const [{ agents }, reference] = await Promise.all([
    api('/agents', agentsResponseSchema, { token }),
    api('/reference', referenceResponseSchema, { token }),
  ]);
  const areaName = (id: string) => reference.areas.find((a) => a.id === id)?.name ?? '';
  const small = `${inputClass} min-h-11`;

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={t('agents.eyebrow')} title={t('agents.title')} />
      <InfoNote>{t('agents.blockNote')}</InfoNote>
      {agents.length === 0 ? <p className="text-muted">{t('common.none')}</p> : null}
      {agents.map((agent) => (
        <Card key={agent.id}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-lg">{agent.agentNumber}</p>
              <h2 className="text-xl font-extrabold">{agent.name}</h2>
              <p className="text-sm text-muted">{agent.areaIds.map(areaName).join(', ')}</p>
            </div>
            <StatusPill
              label={t(`userStatus.${agent.status}` as MessageKey)}
              tone={agent.status === 'ACTIVE' ? 'green' : 'red'}
            />
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <section aria-label={t('agents.resetPin')}>
              <h3 className="mb-2 font-bold">{t('agents.resetPin')}</h3>
              <ActionForm
                action={resetPinAction}
                submit={t('agents.resetPin')}
                variant={agent.status === 'LOCKED' ? 'primary' : 'outline'}
                className="grid gap-2"
              >
                <input type="hidden" name="userId" value={agent.id} />
                <input
                  name="pin"
                  required
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="off"
                  placeholder={t('agents.newPin')}
                  aria-label={t('agents.newPin')}
                  className={`${small} font-mono`}
                />
                <input
                  name="reason"
                  required
                  placeholder={t('common.reason')}
                  aria-label={t('common.reason')}
                  className={small}
                />
              </ActionForm>
            </section>

            <section aria-label={t('agents.devices')}>
              <h3 className="mb-2 font-bold">{t('agents.devices')}</h3>
              {agent.devices.length === 0 ? (
                <p className="text-sm text-muted">{t('agents.noDevices')}</p>
              ) : null}
              <ul className="grid gap-3">
                {agent.devices.map((d) => (
                  <li key={d.id} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm">{d.id.slice(0, 8)}</span>
                      <StatusPill
                        label={t(`deviceStatus.${d.status}` as MessageKey)}
                        tone={d.status === 'ACTIVE' ? 'green' : 'red'}
                      />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {d.lastSyncAt
                        ? t('agents.lastSync', {
                            time: `${formatDiliDate(new Date(d.lastSyncAt))} ${formatDiliTime(new Date(d.lastSyncAt))}`,
                          })
                        : t('agents.neverSynced')}
                    </p>
                    {d.status === 'ACTIVE' ? (
                      <ActionForm
                        action={blockDeviceAction}
                        submit={t('agents.blockDevice')}
                        variant="outline"
                        className="mt-2 flex flex-wrap gap-2"
                      >
                        <input type="hidden" name="deviceId" value={d.id} />
                        <input
                          name="reason"
                          required
                          placeholder={t('common.reason')}
                          aria-label={t('common.reason')}
                          className={`${small} min-w-48 flex-1`}
                        />
                      </ActionForm>
                    ) : (
                      // After blocking, the form goes away with the re-render; say so here.
                      <p className="mt-2 text-sm font-semibold text-red">{t('agents.blockDone')}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </Card>
      ))}
    </div>
  );
}
