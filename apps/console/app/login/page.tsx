// Entrar — console sign-in (FR-04). Design: docs/screens/00-login-consola.png
import { redirect } from 'next/navigation';
import { locales } from '@estacionamento/shared';
import type { MessageKey } from '@estacionamento/shared';
import { BrandMark, Eyebrow, InfoNote } from '../../components/ui';
import { getT } from '../../lib/i18n';
import { getSession, homeFor } from '../../lib/session';
import { setLocaleAction } from './actions';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.user.role));
  const { t, locale } = await getT();

  return (
    <div className="grid min-h-screen md:grid-cols-[3fr_5fr]">
      <aside className="flex flex-col justify-between gap-12 bg-ink p-8 text-surface md:p-12">
        <div className="flex items-center gap-4">
          <BrandMark />
          <div>
            <Eyebrow onDark>{t('authorityName')}</Eyebrow>
            <p className="text-2xl font-extrabold">{t('appName')}</p>
          </div>
        </div>
        <div className="hidden md:block">
          <p className="text-5xl font-extrabold leading-tight">{t('consoleLogin.heroTitle')}</p>
          <p className="mt-6 max-w-md text-xl text-line">{t('consoleLogin.heroText')}</p>
          <div className="mt-12 flex gap-2" aria-hidden>
            <span className="h-2 w-14 rounded-full bg-surface" />
            <span className="h-2 w-14 rounded-full bg-yellow" />
            <span className="h-2 w-14 rounded-full bg-red" />
          </div>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-lg gap-8">
          <div>
            <h1 className="text-4xl font-extrabold">{t('consoleLogin.title')}</h1>
            <p className="mt-2 text-lg text-muted">{t('consoleLogin.subtitle')}</p>
          </div>
          <LoginForm
            labels={{
              username: t('consoleLogin.username'),
              password: t('consoleLogin.password'),
              smsCode: t('consoleLogin.smsCode'),
              submit: t('consoleLogin.submit'),
              codeSent: t('consoleLogin.codeSent'),
              back: t('consoleLogin.back'),
              forgotPassword: t('consoleLogin.forgotPassword'),
            }}
          />
          <form action={setLocaleAction} className="flex justify-end gap-2 text-[15px]">
            {locales.map((l, i) => (
              <span key={l} className="flex items-center gap-2">
                {i > 0 ? <span className="text-muted">·</span> : null}
                <button
                  name="locale"
                  value={l}
                  aria-pressed={l === locale}
                  className={
                    l === locale ? 'font-bold text-ink underline' : 'text-muted hover:text-ink'
                  }
                >
                  {t(`language.${l}` as MessageKey)}
                </button>
              </span>
            ))}
          </form>
          <InfoNote>{t('consoleLogin.auditNote')}</InfoNote>
        </div>
      </main>
    </div>
  );
}
