import { AppointmentStatus, UserRole } from './enums';

/**
 * جدول انتقالات حالة الموعد (القسم 7.2 من الخطة التقنية).
 * تستخدمه الواجهة لإظهار الأزرار المسموحة، والخادم لفرض الانتقال، واختبارات
 * Table-driven تمر على هذا الجدول بالكامل.
 */
export interface AppointmentTransition {
  from: AppointmentStatus;
  to: AppointmentStatus;
  allowedRoles: readonly UserRole[];
  reasonRequired?: boolean;
}

export const APPOINTMENT_TRANSITIONS: readonly AppointmentTransition[] = [
  {
    from: AppointmentStatus.PENDING,
    to: AppointmentStatus.CONFIRMED,
    allowedRoles: [UserRole.RECEPTIONIST, UserRole.ADMIN],
  },
  {
    from: AppointmentStatus.PENDING,
    to: AppointmentStatus.CHECKED_IN,
    allowedRoles: [UserRole.RECEPTIONIST, UserRole.ADMIN],
  },
  {
    from: AppointmentStatus.CONFIRMED,
    to: AppointmentStatus.CHECKED_IN,
    allowedRoles: [UserRole.RECEPTIONIST, UserRole.ADMIN],
  },
  {
    from: AppointmentStatus.PENDING,
    to: AppointmentStatus.CANCELLED,
    allowedRoles: [UserRole.RECEPTIONIST, UserRole.ADMIN],
    reasonRequired: true,
  },
  {
    from: AppointmentStatus.CONFIRMED,
    to: AppointmentStatus.CANCELLED,
    allowedRoles: [UserRole.RECEPTIONIST, UserRole.ADMIN],
    reasonRequired: true,
  },
  {
    from: AppointmentStatus.CONFIRMED,
    to: AppointmentStatus.NO_SHOW,
    allowedRoles: [UserRole.RECEPTIONIST, UserRole.ADMIN],
  },
  {
    from: AppointmentStatus.CHECKED_IN,
    to: AppointmentStatus.COMPLETED,
    allowedRoles: [UserRole.RECEPTIONIST, UserRole.ADMIN, UserRole.DOCTOR],
  },
];

export function findTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): AppointmentTransition | undefined {
  return APPOINTMENT_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus, role: UserRole): boolean {
  const transition = findTransition(from, to);
  return !!transition && transition.allowedRoles.includes(role);
}

/** الحالات النهائية: لا يوجد أي انتقال خارج منها (القسم 7.2). */
export const TERMINAL_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];
