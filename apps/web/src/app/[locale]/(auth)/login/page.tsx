'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

import { AppShell } from '@/components/layout/AppShell';

export default function LoginPage() {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // نداء فعلي نحو /api/v1/auth/login عبر rewrite الواجهة (next.config.mjs).
  // سيبقى يفشل (404/503) إلى أن يُنفَّذ Auth Module في الخادم — هذا متوقَّع
  // ومقصود في هذه المرحلة من المشروع، والنموذج هنا جاهز بالكامل من جهة
  // الواجهة فور توفر نقطة النهاية.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('submitting');
    setErrorMessage(null);

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      window.location.assign('/');
    } catch {
      setStatus('error');
      setErrorMessage(t('auth.backendNotice'));
    }
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-2xl font-bold">{t('auth.loginTitle')}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t('auth.loginSubtitle')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {status === 'submitting' ? t('common.loading') : t('auth.submit')}
          </button>
        </form>

        {status === 'error' && errorMessage ? (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-200/10 dark:text-amber-200">
            {errorMessage}
          </p>
        ) : null}

        <p className="mt-6 text-xs text-slate-500">{t('auth.demoAccountsNotice')}</p>
      </section>
    </AppShell>
  );
}
