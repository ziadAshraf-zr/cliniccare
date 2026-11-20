import type { UserAdminView, UserRole, UserStatus } from '@cliniccare/shared';

import type { UserRow } from './users.repository';

const ROLE_ORDER = ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PATIENT'];

/**
 * تحويل صريح بقائمة سماح (القسم 5: الفصل بالـ Serializers لا بإخفاء الحقول):
 * passwordHash وfailedLogins لا يخرجان من الخادم.
 */
export function toUserAdminView(row: UserRow): UserAdminView {
  return {
    id: row.id,
    email: row.email,
    roles: row.roles
      .map((assignment) => assignment.role)
      .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)) as UserRole[],
    status: row.status as UserStatus,
    lockedUntil: row.lockedUntil ? row.lockedUntil.toISOString() : null,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    preferredLocale: row.preferredLocale,
    notifyByEmail: row.notifyByEmail,
    createdAt: row.createdAt.toISOString(),
  };
}
