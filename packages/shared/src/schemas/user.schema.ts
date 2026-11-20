import { z } from 'zod';
import { UserRole, UserStatus } from '../enums';
import { paginationQuerySchema } from '../pagination';

/**
 * مخططات إدارة المستخدمين من لوحة الإدارة (AccessControl، القسم 6 من الخطة
 * التقنية: GET/POST /users و PATCH /users/:id بصلاحية user:manage).
 * نفس المخطط يستخدمه الخادم للتحقق وتستخدمه الواجهة مع React Hook Form.
 */

/**
 * الأدوار التي يملك المدير إسنادها من اللوحة. دور PATIENT لا يُنشأ إلا عبر
 * دعوة البوابة (القسم 5)، فلا يظهر هنا إطلاقًا.
 */
export const ASSIGNABLE_STAFF_ROLES = [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.DOCTOR] as const;
export type AssignableStaffRole = (typeof ASSIGNABLE_STAFF_ROLES)[number];

export const USER_LOCALES = ['ar', 'en'] as const;

const email = z.string().trim().toLowerCase().email().max(254);

/** من 1 إلى 3 أدوار موظفين، بلا تكرار. */
const staffRoles = z
  .array(z.enum(ASSIGNABLE_STAFF_ROLES))
  .min(1)
  .refine((roles) => new Set(roles).size === roles.length, { message: 'الأدوار يجب ألا تتكرر' });

export const userIdParamSchema = z.string().uuid();

export const createUserSchema = z.object({
  email,
  password: z.string().min(12, 'كلمة المرور يجب ألا تقل عن 12 حرفًا').max(128),
  roles: staffRoles,
  preferredLocale: z.enum(USER_LOCALES).default('ar'),
  notifyByEmail: z.boolean().default(true),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

/**
 * تعديل جزئي. لا يوجد حذف فعلي: "الحذف" هو status = DISABLED، لأن المستخدم
 * مرتبط بأحداث التدقيق والزيارات الموقعة. كلمة المرور لا تتغير من هنا
 * (تغييرها من /auth/change-password).
 */
export const updateUserSchema = z
  .object({
    email,
    roles: staffRoles,
    status: z.nativeEnum(UserStatus),
    preferredLocale: z.enum(USER_LOCALES),
    notifyByEmail: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'يجب إرسال حقل واحد على الأقل' });
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  query: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ASSIGNABLE_STAFF_ROLES).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  sort: z
    .enum(['createdAt:desc', 'createdAt:asc', 'email:asc', 'email:desc', 'lastLoginAt:desc'])
    .default('createdAt:desc'),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** عرض المدير للمستخدم. لا يحتوي أبدًا على passwordHash أو عدّاد المحاولات. */
export interface UserAdminView {
  id: string;
  email: string;
  roles: UserRole[];
  status: UserStatus;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  preferredLocale: string;
  notifyByEmail: boolean;
  createdAt: string;
}
