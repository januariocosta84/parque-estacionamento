// Console building blocks (docs/DESIGN.md "Components"; layout of 07-console-monitorizacao.png).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-16 w-16 text-4xl' : 'h-12 w-12 text-3xl';
  return (
    <span
      aria-hidden
      className={`${box} inline-flex shrink-0 items-center justify-center rounded-xl bg-yellow font-extrabold text-ink`}
    >
      P
    </span>
  );
}

export function Eyebrow({ children, onDark }: { children: ReactNode; onDark?: boolean }) {
  return (
    <p
      className={`text-[13px] font-bold uppercase tracking-[0.14em] ${onDark ? 'text-yellow' : 'text-muted'}`}
    >
      {children}
    </p>
  );
}

/** Eyebrow + title on the left, actions (last update, refresh) on the right. */
export function PageHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-1 text-[28px] font-extrabold leading-tight text-balance">{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-6 ${className}`}>
      {children}
    </section>
  );
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-extrabold">{children}</h2>
      {right}
    </div>
  );
}

/** Big-number tile; `highlight` is the yellow "Recebido hoje" tile. */
export function StatCard({
  label,
  value,
  note,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  note?: string;
  icon?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-6 ${highlight ? 'bg-yellow' : 'border border-line bg-surface'}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[15px] font-semibold ${highlight ? 'text-ink' : 'text-muted'}`}>
          {label}
        </p>
        <span className={highlight ? 'text-ink' : 'text-muted'}>{icon}</span>
      </div>
      <p className="mt-3 text-[40px] font-extrabold leading-none tabular-nums">{value}</p>
      {note ? (
        <p className={`mt-3 text-sm ${highlight ? 'text-ink' : 'text-muted'}`}>{note}</p>
      ) : null}
    </div>
  );
}

export function StatusPill({
  label,
  tone = 'green',
}: {
  label: string;
  tone?: 'green' | 'red' | 'muted';
}) {
  const tones = {
    green: 'bg-green-soft text-green',
    red: 'bg-red-soft text-red',
    muted: 'bg-ground text-muted',
  } as const;
  const dot = { green: 'bg-green', red: 'bg-red', muted: 'bg-muted' } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${tones[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} />
      {label}
    </span>
  );
}

export function InfoNote({
  children,
  tone = 'yellow',
}: {
  children: ReactNode;
  tone?: 'yellow' | 'red' | 'green';
}) {
  const tones = { yellow: 'bg-yellow-soft', red: 'bg-red-soft', green: 'bg-green-soft' } as const;
  return (
    <div
      role={tone === 'red' ? 'alert' : undefined}
      className={`flex gap-3 rounded-xl px-4 py-3 text-[15px] ${tones[tone]}`}
    >
      <Info aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-6 overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-[15px]">
        <thead className="bg-ground text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-6 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`border-t border-line px-6 py-4 align-middle ${className}`}>{children}</td>;
}

export function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="border-t border-line px-6 py-8 text-center text-muted">
        {text}
      </td>
    </tr>
  );
}

/** "1–20 de 54" and previous / next links that keep the other filters. */
export function Pagination({
  path,
  params,
  offset,
  limit,
  total,
  labels,
}: {
  path: string;
  params: Record<string, string | undefined>;
  offset: number;
  limit: number;
  total: number;
  labels: { previous: string; next: string; range: string };
}) {
  const link = (o: number) => {
    const p = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][],
    );
    if (o > 0) p.set('offset', String(o));
    else p.delete('offset');
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  };
  const btn = 'rounded-lg border border-line bg-surface px-4 py-2 font-semibold hover:bg-ground';
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>{labels.range}</span>
      <div className="flex gap-2">
        {offset > 0 ? (
          <Link className={btn} href={link(Math.max(0, offset - limit))}>
            {labels.previous}
          </Link>
        ) : null}
        {offset + limit < total ? (
          <Link className={btn} href={link(offset + limit)}>
            {labels.next}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export const buttonClass = {
  primary:
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-red px-5 font-bold text-surface hover:opacity-90 disabled:opacity-50',
  dark: 'inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-ink px-5 font-bold text-surface hover:opacity-90 disabled:opacity-50',
  outline:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-ink hover:bg-ground',
  link: 'inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 font-semibold text-red hover:bg-red-soft',
} as const;

export const inputClass =
  'min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-yellow';

export const labelClass = 'mb-1.5 block text-[15px] font-semibold text-ink';
