'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { UserRole } from '@cliniccare/shared';
import { Link, usePathname } from '@/i18n/navigation';

type NavSection = {
  href: string;
  labelKey: 'home' | 'reception' | 'doctor' | 'portal' | 'admin';
  /**
   * الدور الذي سيملك صلاحية الوصول لهذا القسم فعليًا بعد تفعيل Auth +
   * AccessControl Module (الأسبوع 1-2 من الخطة التقنية). حاليًا كل الأقسام
   * مرئية بدون قيود لأن تسجيل الدخول الحقيقي لم يُنفَّذ بعد في الخادم —
   * الفلترة هنا جاهزة لتستخدم نفس مصفوفة الأدوار/الصلاحيات في
   * @cliniccare/shared فور توفر جلسة مستخدم حقيقية من `/api/v1/auth/me`.
   */
  role?: UserRole;
};

const SECTIONS: NavSection[] = [
  { href: '/reception', labelKey: 'reception', role: UserRole.RECEPTIONIST },
  { href: '/doctor', labelKey: 'doctor', role: UserRole.DOCTOR },
  { href: '/portal', labelKey: 'portal', role: UserRole.PATIENT },
  { href: '/admin', labelKey: 'admin', role: UserRole.ADMIN },
];

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const otherLocale = locale === 'ar' ? 'en' : 'ar';

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-200/10 dark:text-amber-200">
        {t('common.demoBanner')}
      </div>

      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-semibold text-brand-700 dark:text-brand-500">
            {t('common.appName')}
          </Link>

          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="text-slate-600 hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-500"
              >
                {t(`nav.${section.labelKey}`)}
              </Link>
            ))}
            <Link
              href="/login"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700"
            >
              {t('nav.login')}
            </Link>
            <Link href={pathname} locale={otherLocale} className="text-slate-500 hover:text-brand-600">
              {t('nav.language')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
