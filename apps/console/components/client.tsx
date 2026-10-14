'use client';
// Small interactive pieces; everything else in the console renders on the server.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { buttonClass } from './ui';

/** Re-render the page from the server every `seconds` (FR-20: at least every minute). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}

export function RefreshButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={buttonClass.outline}
      onClick={() => start(() => router.refresh())}
    >
      <RefreshCw aria-hidden className={`h-5 w-5 ${pending ? 'animate-spin' : ''}`} />
      {label}
    </button>
  );
}

/** A select inside a GET filter form that applies itself on change. */
export function AutoSubmitSelect(props: React.ComponentProps<'select'>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

export function AutoSubmitDate(props: React.ComponentProps<'input'>) {
  return <input type="date" {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="grid gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-[16px] font-semibold ${
                active ? 'bg-red-soft text-red' : 'text-ink hover:bg-surface'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

/**
 * A form posting to a server action that returns { ok, error, message }. Shows the result under
 * the fields and resets the form after success.
 */
export function ActionForm({
  action,
  children,
  submit,
  className = '',
  variant = 'primary',
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  submit: string;
  className?: string;
  variant?: keyof typeof buttonClass;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass[variant]}>
          {submit}
        </button>
        {state.error ? (
          <p role="alert" className="text-[15px] font-semibold text-red">
            {state.error}
          </p>
        ) : null}
        {state.ok && state.message ? (
          <p className="text-[15px] font-semibold text-green">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}

/** Six boxes for the SMS code (design 00-login-consola.png); posts as one `code` field. */
export function CodeInput({ name, label }: { name: string; label: string }) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (i: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length > 1) {
      // pasted the whole code
      const next = clean.slice(0, 6).split('');
      setDigits([...next, ...Array(6 - next.length).fill('')]);
      refs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };
  return (
    <fieldset>
      <legend className="mb-1.5 text-[15px] font-semibold">{label}</legend>
      <div className="flex gap-3">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`${label} ${i + 1}`}
            className="h-16 w-14 rounded-xl border border-line bg-surface text-center text-2xl font-semibold focus:border-red focus:outline-none focus:ring-2 focus:ring-red"
          />
        ))}
      </div>
      <input type="hidden" name={name} value={digits.join('')} />
    </fieldset>
  );
}
