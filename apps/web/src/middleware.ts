import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // كل شيء ما عدا /api (ملعوب عليه فعليًا بواسطة rewrite نحو NestJS)
  // وملفات Next.js الداخلية وملفات ثابتة (فيها نقطة في الاسم).
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
