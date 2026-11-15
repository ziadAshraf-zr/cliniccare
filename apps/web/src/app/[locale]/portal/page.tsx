import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AppShell } from '@/components/layout/AppShell';

export default async function PortalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <AppShell>
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-bold">{t('portal.title')}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">{t('portal.description')}</p>
        <p className="mt-6 rounded-md border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700">
          {t('common.comingSoon')}
        </p>
      </section>
    </AppShell>
  );
}
