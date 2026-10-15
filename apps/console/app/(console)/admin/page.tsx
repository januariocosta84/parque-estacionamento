// Administração — accounts, areas, vehicle types and tariffs (FR-28). Nothing is deleted:
// accounts are locked, areas and types deactivated, tariffs replaced from now on.
import Link from 'next/link';
import {
  adminCatalogResponseSchema,
  adminUsersResponseSchema,
  formatDiliDate,
  formatUsd,
  tariffInForce,
} from '@estacionamento/shared';
import type { MessageKey } from '@estacionamento/shared';
import { ActionForm } from '../../../components/client';
import {
  Card,
  CardTitle,
  InfoNote,
  PageHeader,
  StatusPill,
  Table,
  Td,
  inputClass,
  labelClass,
} from '../../../components/ui';
import { api } from '../../../lib/api';
import { getT } from '../../../lib/i18n';
import { requireSession } from '../../../lib/session';
import {
  createAreaAction,
  createClassAction,
  setTariffAction,
  toggleAreaAction,
  toggleClassAction,
  updateUserAction,
} from './actions';
import { CreateUserForm } from './create-user-form';

type Tab = 'users' | 'areas' | 'classes';
const TABS: { key: Tab; label: MessageKey }[] = [
  { key: 'users', label: 'admin.users' },
  { key: 'areas', label: 'admin.areas' },
  { key: 'classes', label: 'admin.classes' },
];

export default async function AdminPage({ searchParams }: PageProps<'/admin'>) {
  const { token, user: me } = await requireSession(['admin']);
  const { t, locale } = await getT();
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'areas' || sp.tab === 'classes' ? sp.tab : 'users';

  const [{ users }, catalog] = await Promise.all([
    api('/admin/users', adminUsersResponseSchema, { token }),
    api('/admin/catalog', adminCatalogResponseSchema, { token }),
  ]);
  const areaName = (id: string) => catalog.areas.find((a) => a.id === id)?.name ?? '?';
  const activeAreas = catalog.areas.filter((a) => a.active);
  const now = new Date();
  const small = `${inputClass} min-h-11`;

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={t('admin.eyebrow')} title={t('nav.admin')} />
      <nav className="flex flex-wrap gap-2" aria-label={t('nav.admin')}>
        {TABS.map((x) => (
          <Link
            key={x.key}
            href={`/admin?tab=${x.key}`}
            aria-current={x.key === tab ? 'page' : undefined}
            className={`min-h-11 rounded-xl px-5 py-2.5 font-bold ${
              x.key === tab
                ? 'bg-red text-surface'
                : 'border border-line bg-surface text-ink hover:bg-ground'
            }`}
          >
            {t(x.label)}
          </Link>
        ))}
      </nav>

      {tab === 'users' ? (
        <>
          <Card>
            <CardTitle>{t('admin.createUser')}</CardTitle>
            <CreateUserForm
              areas={activeAreas}
              labels={{
                submit: t('admin.createUser'),
                role: t('admin.role'),
                name: t('admin.name'),
                agentNumber: t('agentLogin.agentNumber'),
                pin: t('agentLogin.pin'),
                username: t('consoleLogin.username'),
                password: t('consoleLogin.password'),
                phone: t('admin.phone'),
                areas: t('admin.areas'),
                roles: {
                  agent: t('role.agent'),
                  supervisor: t('role.supervisor'),
                  finance: t('role.finance'),
                  auditor: t('role.auditor'),
                  admin: t('role.admin'),
                },
              }}
            />
          </Card>
          <Card>
            <CardTitle>{t('admin.users')}</CardTitle>
            <Table
              head={[t('admin.name'), t('admin.role'), t('admin.areas'), t('common.status'), '']}
            >
              {users.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <p className="font-semibold">{u.name}</p>
                    <p className="font-mono text-sm text-muted">{u.agentNumber ?? u.username}</p>
                    {u.phone ? <p className="text-sm text-muted">{u.phone}</p> : null}
                  </Td>
                  <Td>{t(`role.${u.role}` as MessageKey)}</Td>
                  <Td className="text-sm text-muted">
                    {u.areaIds.map(areaName).join(', ') || '—'}
                  </Td>
                  <Td>
                    <StatusPill
                      label={t(`userStatus.${u.status}` as MessageKey)}
                      tone={u.status === 'ACTIVE' ? 'green' : 'red'}
                    />
                  </Td>
                  <Td>
                    <details>
                      <summary className="cursor-pointer font-semibold text-red">
                        {u.id === me.id
                          ? t('admin.phone')
                          : `${u.status === 'ACTIVE' ? t('admin.lock') : t('admin.unlock')} · ${t('admin.areas')} · ${t('admin.phone')}`}
                      </summary>
                      <div className="mt-3 grid min-w-72 gap-4">
                        <ActionForm
                          action={updateUserAction}
                          submit={t('common.save')}
                          variant="outline"
                          className="grid gap-2"
                        >
                          <input type="hidden" name="id" value={u.id} />
                          <input
                            name="phone"
                            type="tel"
                            defaultValue={u.phone ?? ''}
                            placeholder={t('admin.phone')}
                            aria-label={t('admin.phone')}
                            className={small}
                          />
                          <input
                            name="reason"
                            required
                            placeholder={t('common.reason')}
                            aria-label={t('common.reason')}
                            className={small}
                          />
                        </ActionForm>
                        {u.id === me.id ? null : (
                          <>
                            <ActionForm
                              action={updateUserAction}
                              submit={u.status === 'ACTIVE' ? t('admin.lock') : t('admin.unlock')}
                              variant={u.status === 'ACTIVE' ? 'primary' : 'dark'}
                              className="grid gap-2"
                            >
                              <input type="hidden" name="id" value={u.id} />
                              <input
                                type="hidden"
                                name="status"
                                value={u.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE'}
                              />
                              <input
                                name="reason"
                                required
                                placeholder={t('common.reason')}
                                aria-label={t('common.reason')}
                                className={small}
                              />
                            </ActionForm>
                            <ActionForm
                              action={updateUserAction}
                              submit={t('common.save')}
                              variant="outline"
                              className="grid gap-2"
                            >
                              <input type="hidden" name="id" value={u.id} />
                              <input type="hidden" name="areas" value="1" />
                              <div className="flex flex-wrap gap-2">
                                {activeAreas.map((a) => (
                                  <label key={a.id} className="flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      name="areaIds"
                                      value={a.id}
                                      defaultChecked={u.areaIds.includes(a.id)}
                                      className="h-4 w-4 accent-red"
                                    />
                                    {a.name}
                                  </label>
                                ))}
                              </div>
                              <input
                                name="reason"
                                required
                                placeholder={t('common.reason')}
                                aria-label={t('common.reason')}
                                className={small}
                              />
                            </ActionForm>
                          </>
                        )}
                      </div>
                    </details>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      ) : null}

      {tab === 'areas' ? (
        <Card>
          <CardTitle>{t('admin.areas')}</CardTitle>
          <ActionForm
            action={createAreaAction}
            submit={t('admin.createArea')}
            className="mb-6 flex flex-wrap items-end gap-3"
          >
            <div className="min-w-64">
              <label htmlFor="area-name" className={labelClass}>
                {t('admin.name')}
              </label>
              <input
                id="area-name"
                name="name"
                required
                placeholder="Setor D"
                className={inputClass}
              />
            </div>
          </ActionForm>
          <Table head={[t('admin.name'), t('common.status'), '']}>
            {catalog.areas.map((a) => (
              <tr key={a.id}>
                <Td className="font-semibold">{a.name}</Td>
                <Td>
                  <StatusPill
                    label={a.active ? t('admin.active') : t('admin.inactive')}
                    tone={a.active ? 'green' : 'muted'}
                  />
                </Td>
                <Td>
                  <ActionForm
                    action={toggleAreaAction}
                    submit={a.active ? t('admin.deactivate') : t('admin.activate')}
                    variant="outline"
                  >
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={String(!a.active)} />
                  </ActionForm>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      {tab === 'classes' ? (
        <>
          <InfoNote>{t('admin.tariffNote')}</InfoNote>
          {catalog.vehicleClasses.map((vc) => {
            const tariffs = catalog.tariffs
              .filter((x) => x.vehicleClassId === vc.id)
              .map((x) => ({
                ...x,
                validFrom: new Date(x.validFrom),
                validUntil: x.validUntil ? new Date(x.validUntil) : null,
              }));
            const current = tariffInForce(tariffs, vc.id, now);
            return (
              <Card key={vc.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-sm text-muted">{vc.code}</p>
                    <h2 className="text-xl font-extrabold">
                      {locale === 'tet' ? vc.nameTet : vc.namePt}
                    </h2>
                    <p className="text-sm text-muted">
                      {vc.namePt} · {vc.nameTet}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill
                      label={vc.active ? t('admin.active') : t('admin.inactive')}
                      tone={vc.active ? 'green' : 'muted'}
                    />
                    <ActionForm
                      action={toggleClassAction}
                      submit={vc.active ? t('admin.deactivate') : t('admin.activate')}
                      variant="outline"
                    >
                      <input type="hidden" name="id" value={vc.id} />
                      <input type="hidden" name="active" value={String(!vc.active)} />
                    </ActionForm>
                  </div>
                </div>
                <p className="mt-4 text-lg">
                  {current ? (
                    <>
                      <span className="font-bold tabular-nums">
                        {t('unit.perHour', { amount: formatUsd(current.centsPerHour) })}
                      </span>{' '}
                      <span className="text-muted">
                        {t('admin.since', { date: formatDiliDate(current.validFrom) })}
                      </span>
                    </>
                  ) : (
                    <span className="font-semibold text-red">{t('admin.noTariff')}</span>
                  )}
                </p>
                <ActionForm
                  action={setTariffAction}
                  submit={t('admin.setTariff')}
                  variant="dark"
                  className="mt-4 flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="vehicleClassId" value={vc.id} />
                  <div className="w-48">
                    <label htmlFor={`tariff-${vc.id}`} className={labelClass}>
                      {t('admin.tariff')}
                    </label>
                    <input
                      id={`tariff-${vc.id}`}
                      name="amount"
                      required
                      inputMode="decimal"
                      className={`${small} font-mono`}
                    />
                  </div>
                  <div className="min-w-64 flex-1">
                    <label htmlFor={`reason-${vc.id}`} className={labelClass}>
                      {t('common.reason')}
                    </label>
                    <input id={`reason-${vc.id}`} name="reason" required className={small} />
                  </div>
                </ActionForm>
              </Card>
            );
          })}
          <Card>
            <CardTitle>{t('admin.createClass')}</CardTitle>
            <ActionForm
              action={createClassAction}
              submit={t('admin.createClass')}
              className="grid gap-3 md:grid-cols-3"
            >
              <div>
                <label htmlFor="vc-code" className={labelClass}>
                  {t('admin.code')}
                </label>
                <input
                  id="vc-code"
                  name="code"
                  required
                  placeholder="LIGEIRO"
                  className={`${small} font-mono uppercase`}
                />
              </div>
              <div>
                <label htmlFor="vc-pt" className={labelClass}>
                  {t('admin.namePt')}
                </label>
                <input id="vc-pt" name="namePt" required className={small} />
              </div>
              <div>
                <label htmlFor="vc-tet" className={labelClass}>
                  {t('admin.nameTet')}
                </label>
                <input id="vc-tet" name="nameTet" required className={small} />
              </div>
            </ActionForm>
          </Card>
        </>
      ) : null}
    </div>
  );
}
