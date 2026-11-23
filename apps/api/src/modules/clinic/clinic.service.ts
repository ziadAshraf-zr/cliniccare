import { Injectable } from '@nestjs/common';
import { AuditAction, type AuthenticatedUser, type ClinicView, type UpdateClinicDto } from '@cliniccare/shared';

import { ClinicAudit } from './clinic-audit';
import { ClinicNotFoundException } from './clinic.exceptions';
import { ClinicRepository, type UpdateClinicFields } from './clinic.repository';
import { toClinicView } from './clinic.serializers';

/** بيانات العيادة وإعداداتها (الاسم، المنطقة الزمنية، اللغة الافتراضية). */
@Injectable()
export class ClinicService {
  constructor(
    private readonly repo: ClinicRepository,
    private readonly audit: ClinicAudit,
  ) {}

  async get(actor: AuthenticatedUser): Promise<ClinicView> {
    const row = await this.repo.findById(actor.clinicId);
    if (!row) throw new ClinicNotFoundException();
    return toClinicView(row);
  }

  async update(actor: AuthenticatedUser, dto: UpdateClinicDto): Promise<ClinicView> {
    const row = await this.repo.transaction(async (tx) => {
      const current = await this.repo.findById(actor.clinicId, tx);
      if (!current) throw new ClinicNotFoundException();

      const patch: UpdateClinicFields = {};
      const changedFields: string[] = [];
      for (const key of ['name', 'timezone', 'defaultLocale'] as const) {
        if (dto[key] !== undefined && dto[key] !== current[key]) {
          patch[key] = dto[key];
          changedFields.push(key);
        }
      }

      // لا تغيير فعلي: لا كتابة ولا حدث تدقيق.
      if (changedFields.length === 0) return current;

      const updated = await this.repo.update(tx, actor.clinicId, patch);
      await this.audit.record(tx, {
        actor,
        action: AuditAction.CLINIC_UPDATED,
        resourceType: 'Clinic',
        resourceId: actor.clinicId,
        metadata: { fields: changedFields }, // أسماء الحقول فقط لا قيمها
      });
      return updated;
    });
    return toClinicView(row);
  }
}
