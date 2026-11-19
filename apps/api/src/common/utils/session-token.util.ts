import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** معرّف الجلسة الخام: 256 بت عشوائية (القسم 7 من الخطة التقنية). */
const RAW_TOKEN_BYTES = 32;

/** يولّد معرّف جلسة خامًا عشوائيًا (يوضع في الكوكي، لا يُخزَّن كما هو أبدًا). */
export function generateSessionToken(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString('hex');
}

/** تجزئة SHA-256 للمعرّف الخام — هذا هو ما يُخزَّن في عمود sessions.id. */
export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * رمز CSRF مشتق بدون تخزين (Double-submit cookie موقَّع، القسم 7):
 * HMAC-SHA256(SESSION_SECRET, معرّف الجلسة الخام). العميل يقرأه من كوكي غير
 * HttpOnly ويرسله كترويسة على كل طلب غير آمن؛ الخادم يعيد اشتقاقه ويقارن.
 */
export function computeCsrfToken(rawSessionToken: string, secret: string): string {
  return createHmac('sha256', secret).update(rawSessionToken).digest('hex');
}

/** مقارنة بزمن ثابت لتفادي هجمات توقيت المقارنة النصية العادية. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
