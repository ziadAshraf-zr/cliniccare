import type { Response } from 'express';
import { SESSION_COOKIE_NAME } from '../../common/constants/auth.constants';

const CSRF_COOKIE_NAME = 'csrf_token';

/**
 * يضع كوكي الجلسة (HttpOnly) وكوكي CSRF (قابل للقراءة من JS، القسم 7) معًا
 * بعد دخول ناجح أو قبول دعوة بوابة. secure: true دائمًا — متصفحات Chrome
 * وFirefox تعامل localhost كسياق آمن فتعمل بادئة __Host- محليًا بلا TLS.
 */
export function setAuthCookies(
  res: Response,
  rawSessionToken: string,
  csrfToken: string,
  expiresAt: Date,
): void {
  res.cookie(SESSION_COOKIE_NAME, rawSessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/', secure: true, sameSite: 'lax' });
  res.clearCookie(CSRF_COOKIE_NAME, { path: '/', secure: true, sameSite: 'lax' });
}
