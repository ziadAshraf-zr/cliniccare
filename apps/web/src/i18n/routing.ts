import { defineRouting } from 'next-intl/routing';

/**
 * اللغتان المدعومتان في الواجهة: العربية (افتراضية، RTL) والإنجليزية (LTR).
 * `localePrefix: 'always'` يجعل المسار دائمًا يبدأ بـ /ar أو /en، فلا لبس
 * بين الجذر "/" وأي لغة افتراضية ضمنية (القسم 6 من الخطة التقنية).
 */
export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  localePrefix: 'always',
});

export type AppLocale = (typeof routing.locales)[number];

/**
 * بديل عن `hasLocale` (غير متوفر في إصدار next-intl 3.26.5 المثبَّت هنا) —
 * يتحقق أن القيمة واحدة من اللغتين المدعومتين قبل استخدامها كـ AppLocale.
 */
export function isAppLocale(value: string | undefined): value is AppLocale {
  return !!value && (routing.locales as readonly string[]).includes(value);
}
