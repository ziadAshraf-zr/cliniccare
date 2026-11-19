import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@cliniccare/shared';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/**
 * يُقرأ بواسطة PermissionsGuard (القسم 5): مسار بلا هذا الديكوريتر يكفيه
 * اجتياز SessionGuard فقط (مُصادَق، بلا قيد صلاحية محدّد). المسارات الفعلية
 * التي تستخدمه تُضاف مع كل Module (Patient وScheduling وغيرها لاحقًا).
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
