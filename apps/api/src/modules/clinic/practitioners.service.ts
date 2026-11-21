import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  type AuthenticatedUser,
  type CreatePractitionerDto,
  type CreateTimeOffDto,
  type ListPractitionersQuery,
  type Paginated,
  type PractitionerView,
  type ReplaceWorkingHoursDto,
  type TimeOffView,
} from '@cliniccare/shared';

import { ClinicAudit } from './clinic-audit';
import { isExclusionViolation, isUniqueViolation } from './clinic.db';
import {
  PractitionerExistsException,
  PractitionerNotFoundException,
  PractitionerUserInvalidException,
  TimeOffOverlapException,
} from './clinic.exceptions';
import { toPractitionerView, toTimeOffView, toWorkingIntervals } from './clinic.serializers';
import { PractitionersRepository } from './practitioners.repository';

const sameIntervals = (
  a: { weekday: number; start: string; end: string }[],
  b: { weekday: number; start: string; end: string }[],
) => a.length === b.length && a.every((x, i) => x.weekday === b[i].weekday && x.start === b[i].start && x.end === b[i].end);

/**
 * الأطباء وجداول عملهم وإجازاتهم. ساعات العمل بتوقيت العيادة المحلي، وهي مدخل
 * خدمة الأوقات المتاحة في Scheduling (القسم 7.1)، أما فصل التعارض فللقيد في القاعدة.
 */
@Injectable()
export class PractitionersService {
  constructor(
    private readonly repo: PractitionersRepository,
    private readonly audit: ClinicAudit,
  ) {}

  async list(actor: AuthenticatedUser, query: ListPractitionersQuery): Promise<Paginated<PractitionerView>> {
    const { rows, total } = await this.repo.list(actor.clinicId, query);
    return { items: rows.map(toPractitionerView), page: query.page, pageSize: query.pageSize, total };
  }

  /** يسجّل مستخدمًا بدور DOCTOR كطبيب له جدول وخدمات. المستخدم نفسه يُنشأ من إدارة المستخدمين. */
  async create(actor: AuthenticatedUser, dto: CreatePractitionerDto): Promise<PractitionerView> {
    const row = await this.repo.transaction(async (tx) => {
      if (!(await this.repo.findEligibleDoctorUser(tx, actor.clinicId, dto.userId))) {
        throw new PractitionerUserInvalidException();
      }

      let created;
      try {
        created = await this.repo.insert(tx, dto);
      } catch (error) {
        // UNIQUE(user_id): طبيب واحد لكل مستخدم، حتى عند طلبين متزامنين.
        if (isUniqueViolation(error)) throw new PractitionerExistsException();
        throw error;
      }

      await this.audit.record(tx, {
        actor,
        action: AuditAction.PRACTITIONER_CREATED,
        resourceType: 'Practitioner',
        resourceId: created.id,
      });
      return created;
    });
    return toPractitionerView(row);
  }

  async replaceWorkingHours(
    actor: AuthenticatedUser,
    practitionerId: string,
    dto: ReplaceWorkingHoursDto,
  ): Promise<PractitionerView> {
    const next = [...dto.intervals].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));

    const row = await this.repo.transaction(async (tx) => {
      // فحص العيادة أولًا ثم القفل: لا يُقفل صف طبيب من عيادة أخرى.
      if (!(await this.repo.findById(tx, actor.clinicId, practitionerId))) throw new PractitionerNotFoundException();
      await this.repo.lockById(tx, practitionerId);
      const current = await this.repo.findById(tx, actor.clinicId, practitionerId);
      if (!current) throw new PractitionerNotFoundException();

      // لا تغيير فعلي: لا كتابة ولا حدث تدقيق.
      if (sameIntervals(toWorkingIntervals(current.workingHours), next)) return current;

      await this.repo.replaceWorkingHours(tx, practitionerId, next);
      await this.audit.record(tx, {
        actor,
        action: AuditAction.WORKING_HOURS_UPDATED,
        resourceType: 'Practitioner',
        resourceId: practitionerId,
        metadata: { intervalCount: next.length },
      });

      const updated = await this.repo.findById(tx, actor.clinicId, practitionerId);
      if (!updated) throw new PractitionerNotFoundException();
      return updated;
    });
    return toPractitionerView(row);
  }

  async addTimeOff(actor: AuthenticatedUser, practitionerId: string, dto: CreateTimeOffDto): Promise<TimeOffView> {
    const reason = dto.reason ?? null;
    return this.repo.transaction(async (tx) => {
      if (!(await this.repo.findById(tx, actor.clinicId, practitionerId))) throw new PractitionerNotFoundException();

      let id: string;
      try {
        id = await this.repo.insertTimeOff(tx, practitionerId, dto.startAt, dto.endAt, reason);
      } catch (error) {
        // Exclusion constraint على (practitioner_id, range): الفاصل النهائي عند التزامن.
        if (isExclusionViolation(error)) throw new TimeOffOverlapException();
        throw error;
      }

      await this.audit.record(tx, {
        actor,
        action: AuditAction.TIME_OFF_CREATED,
        resourceType: 'Practitioner',
        resourceId: practitionerId,
      });
      return toTimeOffView({ id, startAt: dto.startAt, endAt: dto.endAt, reason });
    });
  }
}
