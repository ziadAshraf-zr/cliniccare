import { AppException } from '../../common/filters/all-exceptions.filter';

export class ClinicNotFoundException extends AppException {
  constructor() {
    super('NOT_FOUND', 'العيادة غير موجودة');
  }
}

export class ServiceNotFoundException extends AppException {
  constructor() {
    super('NOT_FOUND', 'الخدمة غير موجودة');
  }
}

/** 404 (لا 403) حتى لا يُكشف وجود طبيب في عيادة أخرى (القسم 5). */
export class PractitionerNotFoundException extends AppException {
  constructor() {
    super('NOT_FOUND', 'الطبيب غير موجود');
  }
}

export class PractitionerExistsException extends AppException {
  constructor() {
    super('PRACTITIONER_EXISTS', 'هذا المستخدم مسجَّل طبيبًا بالفعل');
  }
}

/** رسالة واحدة لحالتي "غير موجود في العيادة" و"ليس طبيبًا فعّالًا" حتى لا يُكشف وجود مستخدم في عيادة أخرى. */
export class PractitionerUserInvalidException extends AppException {
  constructor() {
    super('PRACTITIONER_USER_INVALID', 'المستخدم غير موجود أو ليس طبيبًا فعّالًا');
  }
}

export class TimeOffOverlapException extends AppException {
  constructor() {
    super('TIME_OFF_OVERLAP', 'الإجازة تتداخل مع إجازة أخرى لنفس الطبيب');
  }
}
