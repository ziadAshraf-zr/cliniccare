import { Injectable } from '@nestjs/common';
import type { AuditAction, AuthenticatedUser } from '@cliniccare/shared';

import type { Tx } from './clinic.db';

export interface ClinicAuditInput {
  actor: AuthenticatedUser;
  action: AuditAction;
  resourceType: 'Clinic' | 'Service' | 'Practitioner';
  resourceId: string;
  /** أسماء الحقول وأعدادها فقط، لا قيم (القسم 10 من الخطة التقنية). */
  metadata?: Record<string, unknown>;
}

/**
 * يكتب حدث التدقيق داخل معاملة التعديل نفسها، فلا يوجد تغيير بلا أثر.
 * يُستبدل بـ AuditService الرسمي عندما يكتمل ConsentAuditModule.
 */
@Injectable()
export class ClinicAudit {
  async record(tx: Tx, event: ClinicAuditInput): Promise<void> {
    await tx.auditEvent.create({
      data: {
        clinicId: event.actor.clinicId,
        actorId: event.actor.id,
        actorRole: event.actor.roles.join(','),
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        outcome: 'SUCCESS',
        metadata: event.metadata ?? undefined,
      },
    });
  }
}
