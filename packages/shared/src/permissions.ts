import { UserRole } from './enums';

/**
 * مفاتيح الصلاحيات (القسم 5 من الخطة التقنية).
 * الواجهة تستخدمها لإخفاء الأزرار، والخادم يفرضها عبر PermissionsGuard.
 * هذا الملف هو "مصدر الحقيقة" الوحيد لمصفوفة الأدوار.
 */
export const PERMISSIONS = {
  CLINIC_MANAGE: 'clinic:manage',
  USER_MANAGE: 'user:manage',

  PATIENT_CREATE: 'patient:create',
  PATIENT_UPDATE_DEMOGRAPHICS: 'patient:update-demographics',
  PATIENT_READ_ADMIN: 'patient:read-admin',
  PATIENT_READ_CLINICAL: 'patient:read-clinical',

  APPOINTMENT_MANAGE: 'appointment:manage',
  APPOINTMENT_UPDATE_STATUS: 'appointment:update-status',

  ENCOUNTER_WRITE: 'encounter:write',
  ENCOUNTER_SIGN: 'encounter:sign',
  ENCOUNTER_AMEND: 'encounter:amend',

  DOCUMENT_UPLOAD: 'document:upload',
  DOCUMENT_PUBLISH: 'document:publish',

  AUDIT_READ: 'audit:read',
  FHIR_EXPORT: 'fhir:export',

  PORTAL_READ_OWN: 'portal:read-own',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** مصفوفة الأدوار × الصلاحيات، كما في القسم 5 من الخطة التقنية. */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.ADMIN]: [
    PERMISSIONS.CLINIC_MANAGE,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_UPDATE_DEMOGRAPHICS,
    PERMISSIONS.PATIENT_READ_ADMIN,
    PERMISSIONS.APPOINTMENT_MANAGE,
    PERMISSIONS.APPOINTMENT_UPDATE_STATUS,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.FHIR_EXPORT,
  ],
  [UserRole.RECEPTIONIST]: [
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_UPDATE_DEMOGRAPHICS,
    PERMISSIONS.PATIENT_READ_ADMIN,
    PERMISSIONS.APPOINTMENT_MANAGE,
    PERMISSIONS.APPOINTMENT_UPDATE_STATUS,
  ],
  [UserRole.DOCTOR]: [
    PERMISSIONS.PATIENT_READ_ADMIN,
    PERMISSIONS.PATIENT_READ_CLINICAL,
    PERMISSIONS.APPOINTMENT_UPDATE_STATUS,
    PERMISSIONS.ENCOUNTER_WRITE,
    PERMISSIONS.ENCOUNTER_SIGN,
    PERMISSIONS.ENCOUNTER_AMEND,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_PUBLISH,
    PERMISSIONS.FHIR_EXPORT,
  ],
  [UserRole.PATIENT]: [PERMISSIONS.PORTAL_READ_OWN],
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function rolesWithPermission(permission: Permission): UserRole[] {
  return (Object.keys(ROLE_PERMISSIONS) as UserRole[]).filter((role) =>
    roleHasPermission(role, permission),
  );
}
