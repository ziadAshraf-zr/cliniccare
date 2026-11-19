/**
 * ثوابت الجلسة وCSRF وقفل الحساب (القسم 7 من الخطة التقنية).
 * موجودة هنا (common) لا داخل modules/auth لأن SessionGuard في common/guards
 * يحتاجها أيضًا، ولا يصح أن يعتمد common على modules.
 */

/** اسم كوكي الجلسة. بادئة __Host- تفرض Secure وPath=/ بلا Domain (تصلّب المتصفح). */
export const SESSION_COOKIE_NAME = '__Host-sid';

/** مدة الخمول قبل انتهاء الجلسة (Sliding Window)، بالدقائق. */
export const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES ?? 30);

/** السقف المطلق لعمر الجلسة بصرف النظر عن النشاط، بالساعات. */
export const SESSION_ABSOLUTE_HOURS = Number(process.env.SESSION_ABSOLUTE_HOURS ?? 8);

/** ترويسة رمز CSRF المتوقعة من العميل على كل طلب غير آمن (POST/PUT/PATCH/DELETE). */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** عدد محاولات الدخول الفاشلة المتتالية قبل قفل الحساب مؤقتًا. */
export const LOGIN_LOCKOUT_THRESHOLD = 5;

/** مدة القفل المؤقت للحساب بعد تجاوز عدد المحاولات، بالدقائق. */
export const LOGIN_LOCKOUT_MINUTES = 15;
