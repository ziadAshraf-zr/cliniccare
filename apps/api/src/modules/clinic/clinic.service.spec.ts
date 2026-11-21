import { AuditAction, updateClinicSchema, type AuthenticatedUser } from '@cliniccare/shared';

import { AppException } from '../../common/filters/all-exceptions.filter';
import type { ClinicAuditInput } from './clinic-audit';
import type { ClinicRow, Tx } from './clinic.db';
import type { ClinicRepository, UpdateClinicFields } from './clinic.repository';
import { ClinicService } from './clinic.service';

const CLINIC_A = '11111111-1111-4111-8111-111111111111';
const CLINIC_B = '22222222-2222-4222-8222-222222222222';
const actor = (clinicId = CLINIC_A): AuthenticatedUser => ({
  id: '33333333-3333-4333-8333-333333333333',
  clinicId,
  email: 'admin@clinic.test',
  roles: ['ADMIN'] as never,
  preferredLocale: 'ar',
});

class FakeRepo {
  rows = new Map<string, ClinicRow>();
  updates: UpdateClinicFields[] = [];
  async transaction<T>(fn: (tx: Tx) => Promise<T>) {
    return fn({} as Tx);
  }
  async findById(clinicId: string) {
    return this.rows.get(clinicId) ?? null;
  }
  async update(_tx: Tx, clinicId: string, data: UpdateClinicFields) {
    this.updates.push(data);
    const next = { ...this.rows.get(clinicId)!, ...data, updatedAt: new Date('2026-11-21T12:00:00Z') };
    this.rows.set(clinicId, next);
    return next;
  }
}

function setup() {
  const repo = new FakeRepo();
  repo.rows.set(CLINIC_A, {
    id: CLINIC_A,
    name: 'عيادة النور',
    timezone: 'Africa/Cairo',
    defaultLocale: 'ar',
    status: 'ACTIVE',
    updatedAt: new Date('2026-11-01T10:00:00Z'),
  });
  repo.rows.set(CLINIC_B, { ...repo.rows.get(CLINIC_A)!, id: CLINIC_B, name: 'عيادة أخرى' });
  const audits: ClinicAuditInput[] = [];
  const audit = { record: async (_tx: Tx, e: ClinicAuditInput) => void audits.push(e) };
  const service = new ClinicService(repo as unknown as ClinicRepository, audit as never);
  return { repo, audits, service };
}

describe('ClinicService', () => {
  it('يقرأ عيادة المستخدم فقط من الجلسة', async () => {
    const { service } = setup();
    expect((await service.get(actor(CLINIC_A))).name).toBe('عيادة النور');
    expect((await service.get(actor(CLINIC_B))).name).toBe('عيادة أخرى');
  });

  it('يرجع 404 إن لم توجد العيادة', async () => {
    const { service } = setup();
    await expect(service.get(actor('99999999-9999-4999-8999-999999999999'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.get(actor('99999999-9999-4999-8999-999999999999'))).rejects.toBeInstanceOf(AppException);
  });

  it('يعدّل الحقول المتغيرة فقط ويكتب Audit بأسماء الحقول لا قيمها', async () => {
    const { service, repo, audits } = setup();
    const view = await service.update(actor(), { name: 'عيادة الأمل', timezone: 'Africa/Cairo' });

    expect(view.name).toBe('عيادة الأمل');
    expect(repo.updates).toEqual([{ name: 'عيادة الأمل' }]); // timezone لم تتغير
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe(AuditAction.CLINIC_UPDATED);
    expect(audits[0].metadata).toEqual({ fields: ['name'] });
    expect(JSON.stringify(audits[0])).not.toContain('الأمل');
  });

  it('لا يكتب شيئًا ولا Audit إن لم يتغير أي حقل', async () => {
    const { service, repo, audits } = setup();
    await service.update(actor(), { name: 'عيادة النور', defaultLocale: 'ar' });
    expect(repo.updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it('لا يمس عيادة أخرى', async () => {
    const { service, repo } = setup();
    await service.update(actor(CLINIC_A), { name: 'جديد' });
    expect(repo.rows.get(CLINIC_B)!.name).toBe('عيادة أخرى');
  });
});

describe('updateClinicSchema', () => {
  it('يقبل IANA timezone ولغة صالحة', () => {
    expect(updateClinicSchema.safeParse({ timezone: 'Africa/Cairo', defaultLocale: 'en' }).success).toBe(true);
  });

  it('يرفض Offset ثابتًا ومنطقة غير معروفة ولغة خاطئة وجسمًا فارغًا', () => {
    expect(updateClinicSchema.safeParse({ timezone: '+02:00' }).success).toBe(false);
    expect(updateClinicSchema.safeParse({ timezone: 'Mars/Base' }).success).toBe(false);
    expect(updateClinicSchema.safeParse({ defaultLocale: 'fr' }).success).toBe(false);
    expect(updateClinicSchema.safeParse({}).success).toBe(false);
  });

  it('يتجاهل status ولا يسمح بتمريره للتعديل', () => {
    const parsed = updateClinicSchema.parse({ name: 'عيادة', status: 'SUSPENDED' });
    expect(parsed).toEqual({ name: 'عيادة' });
  });
});
