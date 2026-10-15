// Console frame: ink header and left menu (07-console-monitorizacao.png). Every page inside
// requires a signed-in console user; the menu shows only what the role may open.
import type { ReactNode } from 'react';
import {
  Archive,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Settings,
  Ticket,
  UserCog,
  Wallet,
} from 'lucide-react';
import type { MessageKey, Role } from '@estacionamento/shared';
import { NavLinks } from '../../components/client';
import type { NavItem } from '../../components/client';
import { BrandMark, Eyebrow } from '../../components/ui';
import { getT } from '../../lib/i18n';
import { requireSession } from '../../lib/session';
import { logoutAction } from '../login/actions';

const icon = 'h-5 w-5';

const MENU: { href: string; key: MessageKey; roles: Role[]; icon: ReactNode }[] = [
  {
    href: '/monitor',
    key: 'nav.monitoring',
    roles: ['supervisor', 'finance', 'auditor'],
    icon: <LayoutDashboard className={icon} />,
  },
  {
    href: '/tickets',
    key: 'nav.activeTickets',
    roles: ['supervisor'],
    icon: <Ticket className={icon} />,
  },
  {
    href: '/agents',
    key: 'nav.agents',
    roles: ['supervisor', 'admin'],
    icon: <UserCog className={icon} />,
  },
  {
    href: '/history',
    key: 'nav.history',
    roles: ['supervisor', 'finance', 'auditor'],
    icon: <Archive className={icon} />,
  },
  {
    href: '/payments',
    key: 'nav.payments',
    roles: ['supervisor', 'finance', 'auditor'],
    icon: <Wallet className={icon} />,
  },
  {
    href: '/audit',
    key: 'nav.audit',
    roles: ['supervisor', 'auditor', 'admin'],
    icon: <ClipboardList className={icon} />,
  },
  { href: '/admin', key: 'nav.admin', roles: ['admin'], icon: <Settings className={icon} /> },
];

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession();
  const { t } = await getT();
  const items: NavItem[] = MENU.filter((m) => m.roles.includes(user.role)).map((m) => ({
    href: m.href,
    label: t(m.key),
    icon: m.icon,
  }));
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-ink px-6 py-4 text-surface">
        <div className="flex items-center gap-4">
          <BrandMark />
          <div>
            <Eyebrow onDark>{t('authorityName')}</Eyebrow>
            <p className="text-2xl font-extrabold">{t('appName')}</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <span className="hidden font-semibold sm:inline">{t('nav.consoleName')}</span>
          <span className="hidden h-10 w-px bg-muted sm:block" aria-hidden />
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-11 w-11 items-center justify-center rounded-full bg-yellow-soft font-bold text-ink"
            >
              {initials}
            </span>
            <div className="leading-tight">
              <p className="font-semibold">{user.name}</p>
              <p className="font-mono text-sm text-yellow">
                {user.username ?? t(`role.${user.role}`)}
              </p>
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label={t('console.signOut')}
              title={t('console.signOut')}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-line hover:bg-muted/40"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <nav
          aria-label={t('nav.operations')}
          className="border-line p-4 md:w-64 md:shrink-0 md:border-r"
        >
          <p className="mb-3 px-2 text-[13px] font-bold uppercase tracking-[0.14em] text-muted">
            {t('nav.operations')}
          </p>
          <NavLinks items={items} />
          <div className="mt-6 hidden rounded-xl bg-surface/60 p-4 md:block">
            <p className="font-bold">{t('nav.municipalTitle')}</p>
            <p className="mt-1 text-sm text-muted">{t('nav.municipalText')}</p>
          </div>
        </nav>
        <main className="min-w-0 flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
