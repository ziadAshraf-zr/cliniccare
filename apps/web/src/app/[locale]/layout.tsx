import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { isAppLocale, routing } from '@/i18n/routing';

// خط IBM Plex Sans Arabic مستضاف ذاتيًا عبر حزمة npm (@fontsource) بدل
// next/font/google: لا يعتمد على طلب شبكي وقت البناء نحو fonts.googleapis.com
// (قد يُحجب خلف بعض الشبكات/الوكلاء)، ويعمل دون اتصال بالإنترنت وقت التشغيل.
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '../globals.css';

export const metadata: Metadata = {
  title: 'ClinicCare',
  description: 'نظام تجريبي لإدارة عيادة — بيانات اصطناعية بالكامل (مشروع تخرّج)',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }

  // يُمكّن next-intl من توليد الصفحة بصورة ثابتة (Static Rendering) رغم
  // قراءة اللغة من المسار الديناميكي [locale] (القسم 6 من الخطة التقنية).
  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
