import { ASSIGNABLE_STAFF_ROLES } from '@cliniccare/shared';

import {
  CannotModifySelfException,
  LastAdminRequiredException,
  RoleNotAssignableException,
} from '../user.exceptions';

/**
 * سياسات إدارة المستخدمين (الحارس الرابع في القسم 5). دوال نقية بلا قاعدة
 * بيانات، تُستدعى من UsersService داخل المعاملة.
 */

const ASSIGNABLE: readonly string[] = ASSIGNABLE_STAFF_ROLES;

/** يتحقق وقت التنفيذ كخط دفاع ثانٍ فوق مخطط Zod. */
export function assertRolesAssignable(roles: readonly string[]): void {
  if (roles.length === 0 || roles.some((role) => !ASSIGNABLE.includes(role))) {
    throw new RoleNotAssignableException();
  }
}

/** المدير لا يغيّر أدواره ولا يعطّل حسابه بنفسه؛ تعديل بياناته الشخصية مسموح. */
export function assertNotChangingOwnAccess(actorId: string, targetId: string, accessChanged: boolean): void {
  if (accessChanged && actorId === targetId) throw new CannotModifySelfException();
}

/**
 * لا يجوز أن تبقى العيادة بلا مدير فعّال. `lockedAdminIds` هي معرّفات المديرين
 * الفعّالين المقفولين داخل المعاملة نفسها، فلا يغيّرها طلب متزامن.
 */
export function assertClinicKeepsActiveAdmin(params: {
  targetId: string;
  targetWasActiveAdmin: boolean;
  targetStaysActiveAdmin: boolean;
  lockedAdminIds: readonly string[];
}): void {
  const { targetId, targetWasActiveAdmin, targetStaysActiveAdmin, lockedAdminIds } = params;
  if (!targetWasActiveAdmin || targetStaysActiveAdmin) return;
  if (!lockedAdminIds.some((adminId) => adminId !== targetId)) throw new LastAdminRequiredException();
}
