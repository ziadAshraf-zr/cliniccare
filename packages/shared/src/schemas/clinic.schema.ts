import { z } from 'zod';
import { Weekday } from '../enums';
import { paginationQuerySchema } from '../pagination';

/**
 * مخططات وحدة Clinic (القسم 4 و6 من الخطة التقنية): بيانات العيادة وإعداداتها،
 * الخدمات، الأطباء، ساعات العمل، والإجازات. نفس المخطط يستخدمه الخادم للتحقق
 * وتستخدمه الواجهة مع React Hook Form.
 */

export const CLINIC_LOCALES = ['ar', 'en'] as const;

const nonEmpty = { message: 'يجب إرسال حقل واحد على الأقل' };

/** المنطقة الزمنية IANA فقط (مثل Africa/Cairo)، لا Offset ثابت لأن مصر تطبق التوقيت الصيفي. */
const ianaTimezone = z
  .string()
  .regex(/^[A-Za-z]+\/[A-Za-z0-9_+\-/]+$/, 'المنطقة الزمنية يجب أن تكون بصيغة IANA مثل Africa/Cairo')
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'المنطقة الزمنية غير معروفة');

// ========================= العيادة =========================

/** الحقول القابلة للتعديل من شاشة الإعدادات. الحالة (status) لا تتغير من هنا. */
export const updateClinicSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    timezone: ianaTimezone,
    defaultLocale: z.enum(CLINIC_LOCALES),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, nonEmpty);
export type UpdateClinicDto = z.infer<typeof updateClinicSchema>;

export interface ClinicView {
  id: string;
  name: string;
  timezone: string;
  defaultLocale: string;
  status: string;
  updatedAt: string;
}

// ========================= الخدمات =========================

export const serviceIdParamSchema = z.string().uuid();

const serviceFields = {
  nameAr: z.string().trim().min(2).max(100),
  nameEn: z.string().trim().min(2).max(100),
  durationMinutes: z.number().int().min(5).max(240).multipleOf(5),
  priceCents: z.number().int().min(0).max(10_000_000),
};

export const createServiceSchema = z.object(serviceFields);
export type CreateServiceDto = z.infer<typeof createServiceSchema>;

/** لا حذف فعلي: الخدمة مرتبطة بالمواعيد. تغيير المدة لا يمس المواعيد الحالية. */
export const updateServiceSchema = z
  .object(serviceFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, nonEmpty);
export type UpdateServiceDto = z.infer<typeof updateServiceSchema>;

export const listServicesQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['nameAr:asc', 'nameEn:asc', 'createdAt:desc']).default('nameAr:asc'),
});
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;

export interface ServiceView {
  id: string;
  nameAr: string;
  nameEn: string;
  durationMinutes: number;
  priceCents: number;
  createdAt: string;
  updatedAt: string;
}

// ========================= الأطباء =========================

export const practitionerIdParamSchema = z.string().uuid();

export const createPractitionerSchema = z.object({
  userId: z.string().uuid(),
  specialty: z.string().trim().min(2).max(100).optional(),
  /** رقم ترخيص تجريبي، لا قيمة قانونية. */
  licenseNo: z.string().trim().min(2).max(50).optional(),
  defaultSlotMinutes: z.number().int().min(5).max(120).multipleOf(5).default(20),
});
export type CreatePractitionerDto = z.infer<typeof createPractitionerSchema>;

export const listPractitionersQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['email:asc', 'email:desc']).default('email:asc'),
});
export type ListPractitionersQuery = z.infer<typeof listPractitionersQuerySchema>;

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'الوقت يجب أن يكون بصيغة HH:mm');

const workingInterval = z
  .object({ weekday: z.nativeEnum(Weekday), start: timeOfDay, end: timeOfDay })
  .refine((i) => i.end > i.start, { message: 'نهاية الفترة يجب أن تكون بعد بدايتها', path: ['end'] });

/**
 * استبدال كامل لجدول الأسبوع. الأوقات بتوقيت العيادة المحلي (Africa/Cairo) لا UTC.
 * مصفوفة فارغة تعني "لا ساعات عمل". الفترتان المتجاورتان (تنتهي إحداهما حيث تبدأ
 * الأخرى) مسموحتان، والمتداخلتان مرفوضتان.
 */
export const replaceWorkingHoursSchema = z
  .object({ intervals: z.array(workingInterval).max(42) })
  .superRefine(({ intervals }, ctx) => {
    const sorted = [...intervals].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev.weekday === cur.weekday && cur.start < prev.end) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'فترات العمل في نفس اليوم لا يجوز أن تتداخل', path: ['intervals'] });
        return;
      }
    }
  });
export type ReplaceWorkingHoursDto = z.infer<typeof replaceWorkingHoursSchema>;

export const createTimeOffSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }).transform((s) => new Date(s)),
    endAt: z.string().datetime({ offset: true }).transform((s) => new Date(s)),
    reason: z.string().trim().min(1).max(200).optional(),
  })
  .refine((v) => v.endAt > v.startAt, { message: 'نهاية الإجازة يجب أن تكون بعد بدايتها', path: ['endAt'] });
export type CreateTimeOffDto = z.infer<typeof createTimeOffSchema>;

export interface WorkingIntervalView {
  weekday: Weekday;
  start: string;
  end: string;
}

export interface PractitionerView {
  id: string;
  userId: string;
  email: string;
  userStatus: string;
  specialty: string | null;
  licenseNo: string | null;
  defaultSlotMinutes: number;
  workingHours: WorkingIntervalView[];
}

export interface TimeOffView {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}
