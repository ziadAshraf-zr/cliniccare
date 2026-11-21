import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  type AuthenticatedUser,
  type CreateServiceDto,
  type ListServicesQuery,
  type Paginated,
  type ServiceView,
  type UpdateServiceDto,
} from '@cliniccare/shared';

import { ClinicAudit } from './clinic-audit';
import { ServiceNotFoundException } from './clinic.exceptions';
import { toServiceView } from './clinic.serializers';
import { ServiceCatalogRepository, type ServiceFields } from './service-catalog.repository';

const FIELDS = ['nameAr', 'nameEn', 'durationMinutes', 'priceCents'] as const;

/**
 * خدمات العيادة (الاسم بالعربية والإنجليزية، المدة، السعر). لا حذف فعلي لأن الخدمة
 * مرتبطة بالمواعيد. تغيير المدة لا يمس المواعيد المحجوزة، ويسري على الحجوزات الجديدة.
 */
@Injectable()
export class ServiceCatalogService {
  constructor(
    private readonly repo: ServiceCatalogRepository,
    private readonly audit: ClinicAudit,
  ) {}

  async list(actor: AuthenticatedUser, query: ListServicesQuery): Promise<Paginated<ServiceView>> {
    const { rows, total } = await this.repo.list(actor.clinicId, query);
    return { items: rows.map(toServiceView), page: query.page, pageSize: query.pageSize, total };
  }

  async create(actor: AuthenticatedUser, dto: CreateServiceDto): Promise<ServiceView> {
    const row = await this.repo.transaction(async (tx) => {
      const created = await this.repo.insert(tx, actor.clinicId, dto);
      await this.audit.record(tx, {
        actor,
        action: AuditAction.SERVICE_CREATED,
        resourceType: 'Service',
        resourceId: created.id,
      });
      return created;
    });
    return toServiceView(row);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateServiceDto): Promise<ServiceView> {
    const row = await this.repo.transaction(async (tx) => {
      const current = await this.repo.findById(tx, actor.clinicId, id);
      if (!current) throw new ServiceNotFoundException();

      const patch: Partial<ServiceFields> = {};
      const changedFields: string[] = [];
      for (const key of FIELDS) {
        if (dto[key] !== undefined && dto[key] !== current[key]) {
          (patch as Record<string, unknown>)[key] = dto[key];
          changedFields.push(key);
        }
      }
      if (changedFields.length === 0) return current;

      const updated = await this.repo.update(tx, actor.clinicId, id, patch);
      await this.audit.record(tx, {
        actor,
        action: AuditAction.SERVICE_UPDATED,
        resourceType: 'Service',
        resourceId: id,
        metadata: { fields: changedFields },
      });
      return updated;
    });
    return toServiceView(row);
  }
}
