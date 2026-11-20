/**
 * أكواد الأخطاء الموحدة (القسم 6 من الخطة التقنية).
 * كل كود مربوط بحالة HTTP ثابتة، ويُستخدم في الخادم (الـ Filter العام)
 * وفي الواجهة (مفتاح ترجمة errors.<CODE>).
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SLOT_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  ENCOUNTER_LOCKED: 409,
  STALE_VERSION: 409,
  DUPLICATE_SUSPECTED: 409,
  CONSENT_REQUIRED: 403,
  FILE_REJECTED: 422,
  RATE_LIMITED: 429,
  // إدارة المستخدمين (AccessControl)
  EMAIL_TAKEN: 409,
  LAST_ADMIN_REQUIRED: 409,
  CANNOT_MODIFY_SELF: 409,
  ROLE_NOT_ASSIGNABLE: 422,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface ApiErrorShape {
  status: number;
  code: ErrorCode;
  title: string;
  requestId?: string;
  fieldErrors?: Array<{ path: string; message: string }>;
}
