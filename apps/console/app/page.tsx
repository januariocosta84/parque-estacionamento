import { t } from '@estacionamento/shared';

// Placeholder until M7 (sign-in and Monitorização).
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow text-2xl font-extrabold text-ink">
          P
        </span>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">
            {t('authorityName')}
          </p>
          <h1 className="text-2xl font-extrabold">{t('appName')}</h1>
        </div>
      </div>
    </main>
  );
}
