// Area / date / agent filters for every console view (FR-21). A plain GET form, so a filtered
// view is a link that can be bookmarked or shared.
import type { ReactNode } from 'react';
import { CalendarDays, MapPin, Search, Users } from 'lucide-react';
import type { ReferenceResponse } from '@estacionamento/shared';
import type { T } from '../lib/i18n';
import { AutoSubmitDate, AutoSubmitSelect } from './client';

export interface FilterValues {
  areaId?: string;
  date?: string;
  agentId?: string;
}

const box =
  'flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:ring-2 focus-within:ring-yellow';
const field = 'min-h-11 w-full bg-transparent text-[15px] font-semibold focus:outline-none';

export function Filters({
  t,
  reference,
  values,
  showDate = true,
  showAgent = true,
  children,
}: {
  t: T;
  reference: ReferenceResponse;
  values: FilterValues;
  showDate?: boolean;
  showAgent?: boolean;
  /** Extra filter fields for this page (status, type, search). */
  children?: ReactNode;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-4">
      <div className="min-w-56 flex-1 sm:flex-none">
        <label htmlFor="f-area" className="mb-1 block text-sm text-muted">
          {t('filter.area')}
        </label>
        <div className={box}>
          <MapPin aria-hidden className="h-5 w-5 shrink-0 text-muted" />
          <AutoSubmitSelect
            id="f-area"
            name="areaId"
            defaultValue={values.areaId ?? ''}
            className={field}
          >
            <option value="">{t('filter.allAreas')}</option>
            {reference.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
      </div>
      {showDate ? (
        <div className="min-w-48 flex-1 sm:flex-none">
          <label htmlFor="f-date" className="mb-1 block text-sm text-muted">
            {t('filter.date')}
          </label>
          <div className={box}>
            <CalendarDays aria-hidden className="h-5 w-5 shrink-0 text-muted" />
            <AutoSubmitDate
              id="f-date"
              name="date"
              defaultValue={values.date ?? ''}
              className={field}
            />
          </div>
        </div>
      ) : null}
      {showAgent ? (
        <div className="min-w-56 flex-1 sm:flex-none">
          <label htmlFor="f-agent" className="mb-1 block text-sm text-muted">
            {t('filter.agent')}
          </label>
          <div className={box}>
            <Users aria-hidden className="h-5 w-5 shrink-0 text-muted" />
            <AutoSubmitSelect
              id="f-agent"
              name="agentId"
              defaultValue={values.agentId ?? ''}
              className={field}
            >
              <option value="">{t('filter.allAgents')}</option>
              {reference.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.agentNumber} · {a.name}
                </option>
              ))}
            </AutoSubmitSelect>
          </div>
        </div>
      ) : null}
      {children}
      <noscript>
        <button type="submit" className="min-h-12 rounded-xl bg-ink px-4 font-bold text-surface">
          {t('common.apply')}
        </button>
      </noscript>
    </form>
  );
}

/** Read the filter values from the page's search params. */
export function filterValues(sp: Record<string, string | string[] | undefined>): FilterValues {
  const one = (k: string) => (typeof sp[k] === 'string' && sp[k] ? (sp[k] as string) : undefined);
  return { areaId: one('areaId'), date: one('date'), agentId: one('agentId') };
}

/** Free-text search by plate, serial or reference. */
export function SearchField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-64 flex-1">
      <label htmlFor="f-q" className="mb-1 block text-sm text-muted">
        {label}
      </label>
      <div className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:ring-2 focus-within:ring-yellow">
        <Search aria-hidden className="h-5 w-5 shrink-0 text-muted" />
        <input
          id="f-q"
          name="q"
          type="search"
          defaultValue={value}
          placeholder={label}
          className="min-h-11 w-full bg-transparent text-[15px] focus:outline-none"
        />
      </div>
    </div>
  );
}
