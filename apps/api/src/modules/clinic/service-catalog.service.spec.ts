import {
  AuditAction,
  createServiceSchema,
  updateServiceSchema,
  type AuthenticatedUser,
  type ListServicesQuery,
} from '@cliniccare/shared';

import type { ClinicAuditInput } from './clinic-audit';
import type { ServiceRow, Tx } from './clinic.db';
import type { ServiceCatalogRepository, ServiceFields } from './service-catalog.repository';
import { ServiceCatalogService } from './service-catalog.service';

const CLINIC_A = '11111111-1111-4111-8111-111111111111';
const CLINIC_B = '22222222-2222-4222-8222-222222222222';
const actor = (clinicId = CLINIC_A): AuthenticatedUser => ({
  id: '33333333-3333-4333-8333-333333333333',
  clinicId,
  email: 'admin@clinic.test',
  roles: ['ADMIN'] as never,
  preferredLocale: 'ar',
});

let seq = 0;
class FakeRepo {
  rows: ServiceRow[] = [];
  async transaction<T>(fn: (tx: Tx) => Promise<T>) {
    return fn({} as Tx);
  }
  async list(clinicId: string) {
    const rows = this.rows.filter((r) => r.clinicId === clinicId);
    return { rows, total: rows.length };
  }
  async findById(_tx: Tx, clinicId: string, id: string) {
    return this.rows.find((r) => r.id === id && r.clinicId === clinicId) ?? null;
  }
  async insert(_tx: Tx, clinicId: string, data: ServiceFields) {
    const row: ServiceRow = {
      id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
      clinicId,
      ...data,
      createdAt: new Date('2026-11-21T10:00:00Z'),
      updatedAt: new Date('2026-11-21T10:00:00Z'),
    };
    this.rows.push(row);
    return row;
  }
  async update(_tx: Tx, clinicId: string, id: string, data: Partial<ServiceFields>) {
    const row = this.rows.find((r) => r.id === id && r.clinicId === clinicId)!;
    Object.assign(row, data);
    return row;
  }
}

const dto: ServiceFields = { nameAr: 'كشف', nameEn: 'Consultation', durationMinutes: 20, priceCents: 30000 };
const query: ListServicesQuery = { page: 1, pageSize: 20, sort: 'nameAr:asc' };

function setup() {
  const repo = new FakeRepo();
  const audits: ClinicAuditInput[] = [];
  const audit = { record: async (_tx: Tx, e: ClinicAuditInput) => void audits.push(e) };
  return { repo, audits, service: new ServiceCatalogService(repo as unknown as ServiceCatalogRepository, audit as never) };
}

describe('ServiceCatalogService', () => {
  it('ينشئ خدمة في عيادة المستخدم ويكتب Audit بلا محتوى', async () => {
    const { service, audits } = setup();
    const created = await service.create(actor(), dto);
    expect(created.nameEn).toBe('Consultation');
    expect(audits[0]).toMatchObject({ action: AuditAction.SERVICE_CREATED, resourceType: 'Service', resourceId: created.id });
    expect(audits[0].metadata).toBeUndefined();
  });

  it('القائمة معزولة بالعيادة', async () => {
    const { service } = setup();
    await service.create(actor(CLINIC_A), dto);
    await service.create(actor(CLINIC_B), { ...dto, nameAr: 'استشارة' });
    const page = await service.list(actor(CLINIC_A), query);
    expect(page.total).toBe(1);
    expect(page.items[0].nameAr).toBe('كشف');
  });

  it('يرجع 404 عند تعديل خدمة عيادة أخرى', async () => {
    const { service } = setup();
    const other = await service.create(actor(CLINIC_B), dto);
    await expect(service.update(actor(CLINIC_A), other.id, { priceCents: 1 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('يعدّل الحقول المتغيرة فقط ويسجل أسماءها', async () => {
    const { service, audits } = setup();
    const created = await service.create(actor(), dto);
    const updated = await service.update(actor(), created.id, { priceCents: 35000, durationMinutes: 20 });
    expect(updated.priceCents).toBe(35000);
    expect(audits[1].action).toBe(AuditAction.SERVICE_UPDATED);
    expect(audits[1].metadata).toEqual({ fields: ['priceCents'] });
  });

  it('لا Audit ولا كتابة عند عدم التغيير', async () => {
    const { service, audits } = setup();
    const created = await service.create(actor(), dto);
    await service.update(actor(), created.id, { nameAr: 'كشف' });
    expect(audits).toHaveLength(1);
  });
});

describe('service schemas', () => {
  it('يقبل خدمة صحيحة', () => {
    expect(createServiceSchema.safeParse(dto).success).toBe(true);
  });

  it('يرفض مدة ليست من مضاعفات 5 أو خارج النطاق وسعرًا سالبًا أو كسريًا', () => {
    expect(createServiceSchema.safeParse({ ...dto, durationMinutes: 22 }).success).toBe(false);
    expect(createServiceSchema.safeParse({ ...dto, durationMinutes: 0 }).success).toBe(false);
    expect(createServiceSchema.safeParse({ ...dto, durationMinutes: 245 }).success).toBe(false);
    expect(createServiceSchema.safeParse({ ...dto, priceCents: -1 }).success).toBe(false);
    expect(createServiceSchema.safeParse({ ...dto, priceCents: 10.5 }).success).toBe(false);
  });

  it('التعديل الجزئي لا يقبل جسمًا فارغًا', () => {
    expect(updateServiceSchema.safeParse({}).success).toBe(false);
    expect(updateServiceSchema.safeParse({ priceCents: 100 }).success).toBe(true);
  });
});
