import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AppShell } from '@/components/layout/AppShell';
import { Link } from '@/i18n/navigation';

const SECTION_KEYS = ['reception', 'doctor', 'portal', 'admin'] as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();

  return (
    <AppShell>
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t('home.title')}</h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">{t('home.subtitle')}</p>
        <div className="mt-8">
          <Link
            href="/login"
            className="inline-block rounded-md bg-brand-600 px-6 py-3 font-medium text-white hover:bg-brand-700"
          >
            {t('home.cta')}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16">
        <h2 className="text-center text-2xl font-semibold">{t('home.sectionsTitle')}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600 dark:text-slate-300">
          {t('home.sectionsSubtitle')}
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECTION_KEYS.map((key) => (
            <Link
              key={key}
              href={`/${key}`}
              className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-brand-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <h3 className="font-semibold text-brand-700 dark:text-brand-500">
                {t(`${key}.title`)}
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {t(`${key}.description`)}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
