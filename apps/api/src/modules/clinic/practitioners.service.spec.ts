import {
  AuditAction,
  Weekday,
  createTimeOffSchema,
  replaceWorkingHoursSchema,
  type AuthenticatedUser,
  type WorkingIntervalView,
} from '@cliniccare/shared';

import type { ClinicAuditInput } from './clinic-audit';
import type { PractitionerRow, Tx } from './clinic.db';
import { toTimeColumn } from './clinic.serializers';
import type { InsertPractitionerData, PractitionersRepository } from './practitioners.repository';
import { PractitionersService } from './practitioners.service';

const CLINIC_A = '11111111-1111-4111-8111-111111111111';
const CLINIC_B = '22222222-2222-4222-8222-222222222222';
const actor = (clinicId = CLINIC_A): AuthenticatedUser => ({
  id: '33333333-3333-4333-8333-333333333333',
  clinicId,
  email: 'admin@clinic.test',
  roles: ['ADMIN'] as never,
  preferredLocale: 'ar',
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

class FakeRepo {
  /** userId → { clinicId, eligible } */
  doctorUsers = new Map<string, { clinicId: string; eligible: boolean }>();
  practitioners: (PractitionerRow & { clinicId: string })[] = [];
  timeOff: { practitionerId: string; startAt: Date; endAt: Date }[] = [];
  locks: string[] = [];
  replaceCalls = 0;
  insertError: unknown = null;
  private seq = 100;

  async transaction<T>(fn: (tx: Tx) => Promise<T>) {
    return fn({} as Tx);
  }
  async list(clinicId: string) {
    const rows = this.practitioners.filter((p) => p.clinicId === clinicId);
    return { rows, total: rows.length };
  }
  async findById(_tx: Tx, clinicId: string, id: string) {
    return this.practitioners.find((p) => p.id === id && p.clinicId === clinicId) ?? null;
  }
  async findEligibleDoctorUser(_tx: Tx, clinicId: string, userId: string) {
    const u = this.doctorUsers.get(userId);
    return !!u && u.clinicId === clinicId && u.eligible;
  }
  async insert(_tx: Tx, data: InsertPractitionerData) {
    if (this.insertError) throw this.insertError;
    const clinicId = this.doctorUsers.get(data.userId)!.clinicId;
    const row = {
      id: uuid(++this.seq),
      clinicId,
      userId: data.userId,
      specialty: data.specialty ?? null,
      licenseNo: data.licenseNo ?? null,
      defaultSlotMinutes: data.defaultSlotMinutes,
      user: { email: 'doc@clinic.test', status: 'ACTIVE' },
      workingHours: [],
    };
    this.practitioners.push(row);
    return row;
  }
  async lockById(_tx: Tx, id: string) {
    this.locks.push(id);
  }
  async replaceWorkingHours(_tx: Tx, practitionerId: string, intervals: WorkingIntervalView[]) {
    this.replaceCalls++;
    const row = this.practitioners.find((p) => p.id === practitionerId)!;
    row.workingHours = intervals.map((i) => ({
      weekday: i.weekday,
      startTime: toTimeColumn(i.start),
      endTime: toTimeColumn(i.end),
    }));
  }
  async insertTimeOff(_tx: Tx, practitionerId: string, startAt: Date, endAt: Date) {
    if (this.insertError) throw this.insertError;
    this.timeOff.push({ practitionerId, startAt, endAt });
    return uuid(900 + this.timeOff.length);
  }
}

function setup() {
  const repo = new FakeRepo();
  repo.doctorUsers.set(uuid(1), { clinicId: CLINIC_A, eligible: true });
  repo.doctorUsers.set(uuid(2), { clinicId: CLINIC_B, eligible: true });
  repo.doctorUsers.set(uuid(3), { clinicId: CLINIC_A, eligible: false });
  const audits: ClinicAuditInput[] = [];
  const audit = { record: async (_tx: Tx, e: ClinicAuditInput) => void audits.push(e) };
  const service = new PractitionersService(repo as unknown as PractitionersRepository, audit as never);
  return { repo, audits, service };
}

const create = (service: PractitionersService, userId = uuid(1)) =>
  service.create(actor(), { userId, defaultSlotMinutes: 20 });

describe('PractitionersService.create', () => {
  it('يسجّل طبيبًا فعّالًا من نفس العيادة ويكتب Audit', async () => {
    const { service, audits } = setup();
    const view = await create(service);
    expect(view.defaultSlotMinutes).toBe(20);
    expect(audits[0]).toMatchObject({ action: AuditAction.PRACTITIONER_CREATED, resourceType: 'Practitioner' });
  });

  it('يرفض مستخدم عيادة أخرى أو غير فعّال أو غير موجود بنفس الرد', async () => {
    const { service } = setup();
    for (const userId of [uuid(2), uuid(3), uuid(77)]) {
      await expect(create(service, userId)).rejects.toMatchObject({ code: 'PRACTITIONER_USER_INVALID' });
    }
  });

  it('يرفض تسجيل المستخدم طبيبًا مرتين (UNIQUE user_id)', async () => {
    const { service, repo } = setup();
    await create(service);
    repo.insertError = { code: 'P2002' };
    await expect(create(service)).rejects.toMatchObject({ code: 'PRACTITIONER_EXISTS' });
  });

  it('القائمة معزولة بالعيادة', async () => {
    const { service } = setup();
    await create(service);
    await service.create(actor(CLINIC_B), { userId: uuid(2), defaultSlotMinutes: 20 });
    const page = await service.list(actor(CLINIC_A), { page: 1, pageSize: 20, sort: 'email:asc' });
    expect(page.total).toBe(1);
  });
});

describe('PractitionersService.replaceWorkingHours', () => {
  const week = {
    intervals: [
      { weekday: Weekday.SUNDAY, start: '09:00', end: '13:00' },
      { weekday: Weekday.SUNDAY, start: '17:00', end: '21:00' },
      { weekday: Weekday.MONDAY, start: '09:00', end: '13:00' },
    ],
  };

  it('يستبدل الجدول بالكامل ويقفل الصف ويكتب Audit بعدد الفترات فقط', async () => {
    const { service, repo, audits } = setup();
    const doc = await create(service);
    const view = await service.replaceWorkingHours(actor(), doc.id, week);

    expect(repo.locks).toEqual([doc.id]);
    expect(view.workingHours).toEqual(week.intervals);
    expect(audits[1]).toMatchObject({ action: AuditAction.WORKING_HOURS_UPDATED, metadata: { intervalCount: 3 } });
  });

  it('لا يكتب ولا يسجّل Audit إذا لم يتغير الجدول', async () => {
    const { service, repo, audits } = setup();
    const doc = await create(service);
    await service.replaceWorkingHours(actor(), doc.id, week);
    await service.replaceWorkingHours(actor(), doc.id, { intervals: [...week.intervals].reverse() });
    expect(repo.replaceCalls).toBe(1);
    expect(audits).toHaveLength(2); // create + أول استبدال فقط
  });

  it('مصفوفة فارغة تمسح الجدول', async () => {
    const { service } = setup();
    const doc = await create(service);
    await service.replaceWorkingHours(actor(), doc.id, week);
    const view = await service.replaceWorkingHours(actor(), doc.id, { intervals: [] });
    expect(view.workingHours).toEqual([]);
  });

  it('يرجع 404 لطبيب عيادة أخرى ولا يقفل صفه', async () => {
    const { service, repo } = setup();
    const other = await service.create(actor(CLINIC_B), { userId: uuid(2), defaultSlotMinutes: 20 });
    await expect(service.replaceWorkingHours(actor(CLINIC_A), other.id, week)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(repo.locks).toHaveLength(0);
  });
});

describe('PractitionersService.addTimeOff', () => {
  const body = createTimeOffSchema.parse({
    startAt: '2026-12-01T08:00:00+02:00',
    endAt: '2026-12-03T08:00:00+02:00',
    reason: 'إجازة',
  });

  it('يسجل الإجازة ويرجعها بتوقيت UTC ISO', async () => {
    const { service, audits } = setup();
    const doc = await create(service);
    const view = await service.addTimeOff(actor(), doc.id, body);
    expect(view.startAt).toBe('2026-12-01T06:00:00.000Z');
    expect(view.reason).toBe('إجازة');
    expect(audits[1].action).toBe(AuditAction.TIME_OFF_CREATED);
    expect(JSON.stringify(audits[1])).not.toContain('إجازة'); // السبب لا يدخل التدقيق
  });

  it('يحوّل خطأ قيد الاستبعاد 23P01 إلى TIME_OFF_OVERLAP', async () => {
    const { service, repo } = setup();
    const doc = await create(service);
    repo.insertError = { code: 'P2010', meta: { code: '23P01' } };
    await expect(service.addTimeOff(actor(), doc.id, body)).rejects.toMatchObject({ code: 'TIME_OFF_OVERLAP' });
  });

  it('لا يحوّل الأخطاء الأخرى', async () => {
    const { service, repo } = setup();
    const doc = await create(service);
    repo.insertError = new Error('connection lost');
    await expect(service.addTimeOff(actor(), doc.id, body)).rejects.toThrow('connection lost');
  });

  it('يرجع 404 لطبيب عيادة أخرى', async () => {
    const { service } = setup();
    const other = await service.create(actor(CLINIC_B), { userId: uuid(2), defaultSlotMinutes: 20 });
    await expect(service.addTimeOff(actor(CLINIC_A), other.id, body)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('working hours / time-off schemas', () => {
  const day = (start: string, end: string, weekday = Weekday.SUNDAY) => ({ weekday, start, end });

  it('يقبل فترتين متجاورتين ويرفض المتداخلتين', () => {
    const ok = replaceWorkingHoursSchema.safeParse({ intervals: [day('09:00', '13:00'), day('13:00', '17:00')] });
    const bad = replaceWorkingHoursSchema.safeParse({ intervals: [day('09:00', '13:00'), day('12:00', '17:00')] });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it('التداخل يخص نفس اليوم فقط', () => {
    const parsed = replaceWorkingHoursSchema.safeParse({
      intervals: [day('09:00', '13:00', Weekday.SUNDAY), day('09:00', '13:00', Weekday.MONDAY)],
    });
    expect(parsed.success).toBe(true);
  });

  it('يرفض نهاية قبل البداية أو مساوية لها وصيغة وقت خاطئة ويومًا خارج 0-6', () => {
    for (const interval of [day('13:00', '09:00'), day('09:00', '09:00'), day('9:00', '13:00'), day('09:00', '24:00'), day('09:00', '13:00', 7 as Weekday)]) {
      expect(replaceWorkingHoursSchema.safeParse({ intervals: [interval] }).success).toBe(false);
    }
  });

  it('الإجازة تتطلب منطقة زمنية صريحة ونهاية بعد البداية', () => {
    expect(createTimeOffSchema.safeParse({ startAt: '2026-12-01T08:00:00', endAt: '2026-12-02T08:00:00' }).success).toBe(false);
    expect(createTimeOffSchema.safeParse({ startAt: '2026-12-02T08:00:00Z', endAt: '2026-12-01T08:00:00Z' }).success).toBe(false);
    expect(createTimeOffSchema.safeParse({ startAt: '2026-12-01T08:00:00Z', endAt: '2026-12-02T08:00:00Z' }).success).toBe(true);
  });
});
