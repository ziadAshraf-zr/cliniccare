import { AppException } from '../../common/filters/all-exceptions.filter';

/** 404 (لا 403) حتى لا يُكشف وجود مستخدم في عيادة أخرى أو حساب مريض (القسم 5). */
export class UserNotFoundException extends AppException {
  constructor() {
    super('NOT_FOUND', 'المستخدم غير موجود');
  }
}

export class EmailTakenException extends AppException {
  constructor() {
    super('EMAIL_TAKEN', 'البريد الإلكتروني مستخدم بالفعل');
  }
}

export class LastAdminRequiredException extends AppException {
  constructor() {
    super('LAST_ADMIN_REQUIRED', 'يجب أن تحتفظ العيادة بمدير فعّال واحد على الأقل');
  }
}

export class CannotModifySelfException extends AppException {
  constructor() {
    super('CANNOT_MODIFY_SELF', 'لا يمكنك تغيير دورك أو تعطيل حسابك بنفسك');
  }
}

export class RoleNotAssignableException extends AppException {
  constructor() {
    super('ROLE_NOT_ASSIGNABLE', 'هذا الدور لا يمكن إسناده من لوحة الإدارة');
  }
}
