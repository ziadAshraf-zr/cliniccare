import { AuditAction, UserRole, createUserSchema, updateUserSchema, type AuthenticatedUser } from '@cliniccare/shared';

import { AppException } from '../../common/filters/all-exceptions.filter';
import type { PasswordHasher } from './password-hasher';
import type {
  AuditInput,
  InsertUserData,
  Tx,
  UpdateUserFields,
  UserRow,
  UsersRepository,
} from './users.repository';
import { UsersService } from './users.service';

const CLINIC_A = '11111111-1111-4111-8111-111111111111';
const CLINIC_B = '22222222-2222-4222-8222-222222222222';

let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function row(over: Partial<Omit<UserRow, 'roles'>> & { roles?: string[] } = {}): UserRow {
  const { roles = ['RECEPTIONIST'], ...rest } = over;
  const id = uid();
  return {
    id,
    clinicId: CLINIC_A,
    email: `user${seq}@clinic.test`,
    status: 'ACTIVE',
    failedLogins: 0,
    lockedUntil: null,
    lastLoginAt: null,
    preferredLocale: 'ar',
    notifyByEmail: true,
    createdAt: new Date('2026-11-01T10:00:00Z'),
    ...rest,
    roles: roles.map((role) => ({ role })),
  };
}

/** بديل في الذاكرة لـ UsersRepository بنفس عزل العيادة وقاعدة "المستخدم المُدار". */
class FakeRepo {
  users: UserRow[] = [];
  audits: AuditInput[] = [];
  revoked: string[] = [];
  insertError: unknown = null;
  lockCalls = 0;

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return fn({} as Tx);
  }
  private managed(user: UserRow) {
    return user.roles.some((r) => ['ADMIN', 'RECEPTIONIST', 'DOCTOR'].includes(r.role));
  }
  async list(clinicId: string) {
    const rows = this.users.filter((u) => u.clinicId === clinicId && this.managed(u));
    return { rows, total: rows.length };
  }
  async getManaged(clinicId: string, id: string) {
    return this.users.find((u) => u.id === id && u.clinicId === clinicId && this.managed(u)) ?? null;
  }
  async findManagedById(_tx: Tx, clinicId: string, id: string) {
    return this.getManaged(clinicId, id);
  }
  async findByEmail(_tx: Tx, clinicId: string, email: string) {
    return this.users.find((u) => u.clinicId === clinicId && u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }
  async insert(_tx: Tx, data: InsertUserData) {
    if (this.insertError) throw this.insertError;
    const user = row({
      clinicId: data.clinicId,
      email: data.email,
      preferredLocale: data.preferredLocale,
      notifyByEmail: data.notifyByEmail,
      roles: data.roles,
    });
    (user as UserRow & { passwordHash?: string }).passwordHash = data.passwordHash;
    this.users.push(user);
    return user;
  }
  async updateFields(_tx: Tx, clinicId: string, id: string, data: UpdateUserFields) {
    const user = this.users.find((u) => u.id === id && u.clinicId === clinicId)!;
    Object.assign(user, data);
    return user;
  }
  async replaceStaffRoles(_tx: Tx, userId: string, roles: string[]) {
    const user = this.users.find((u) => u.id === userId)!;
    const kept = user.roles.filter((r) => !['ADMIN', 'RECEPTIONIST', 'DOCTOR'].includes(r.role));
    user.roles = [...kept, ...roles.map((role) => ({ role }))];
  }
  async revokeSessions(_tx: Tx, userId: string) {
    this.revoked.push(userId);
  }
  async lockActiveAdminIds(_tx: Tx, clinicId: string) {
    this.lockCalls++;
    return this.users
      .filter((u) => u.clinicId === clinicId && u.status === 'ACTIVE' && u.roles.some((r) => r.role === 'ADMIN'))
      .map((u) => u.id);
  }
  async insertAudit(_tx: Tx, event: AuditInput) {
    this.audits.push(event);
  }
}

function setup() {
  const repo = new FakeRepo();
  const hashed: string[] = [];
  const hasher = { hash: async (plain: string) => (hashed.push(plain), `argon2id$${plain.length}`) };
  const service = new UsersService(repo as unknown as UsersRepository, hasher as unknown as PasswordHasher);

  const adminRow = row({ roles: ['ADMIN'], email: 'admin@clinic.test' });
  repo.users.push(adminRow);
  const actor: AuthenticatedUser = {
    id: adminRow.id,
    clinicId: CLINIC_A,
    email: adminRow.email,
    roles: [UserRole.ADMIN],
    preferredLocale: 'ar',
  };
  return { repo, service, hashed, actor, adminRow };
}

const validCreate = () =>
  createUserSchema.parse({
    email: '  New.Doctor@Clinic.TEST ',
    password: 'a-long-password-123',
    roles: ['DOCTOR'],
  });

const actions = (repo: FakeRepo) => repo.audits.map((a) => a.action);

describe('UsersService.create', () => {
  it('يطبّع البريد ويخزّن التجزئة فقط ويسجّل التدقيق بلا بيانات شخصية', async () => {
    const { service, repo, hashed, actor } = setup();
    const view = await service.create(actor, validCreate());

    expect(view.email).toBe('new.doctor@clinic.test');
    expect(view.roles).toEqual(['DOCTOR']);
    expect(hashed).toEqual(['a-long-password-123']);
    expect(JSON.stringify(view)).not.toMatch(/hash|password|argon2/i);
    expect((repo.users.at(-1) as UserRow & { passwordHash?: string }).passwordHash).toBe('argon2id$19');

    expect(repo.audits).toHaveLength(1);
    expect(repo.audits[0]).toMatchObject({
      action: AuditAction.USER_CREATED,
      clinicId: CLINIC_A,
      actorId: actor.id,
      actorRole: 'ADMIN',
      resourceId: view.id,
      metadata: { roles: ['DOCTOR'] },
    });
    expect(JSON.stringify(repo.audits[0].metadata)).not.toMatch(/clinic\.test|password|hash/i);
  });

  it('يرفض بريدًا مكررًا في نفس العيادة دون حساسية لحالة الحروف', async () => {
    const { service, actor } = setup();
    await service.create(actor, validCreate());
    await expect(service.create(actor, validCreate())).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('يسمح بنفس البريد في عيادة أخرى', async () => {
    const { service, actor } = setup();
    await service.create(actor, validCreate());
    await expect(service.create({ ...actor, clinicId: CLINIC_B }, validCreate())).resolves.toBeDefined();
  });

  it('يحوّل سباق unique-violation إلى EMAIL_TAKEN', async () => {
    const { service, repo, actor } = setup();
    repo.insertError = Object.assign(new Error('duplicate'), { code: 'P2002' });
    await expect(service.create(actor, validCreate())).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    expect(repo.audits).toEqual([]);
  });

  it('يرفض PATIENT حتى لو تجاوز الطلب مخطط Zod', async () => {
    const { service, actor } = setup();
    const dto = { ...validCreate(), roles: ['PATIENT'] } as unknown as Parameters<UsersService['create']>[1];
    await expect(service.create(actor, dto)).rejects.toMatchObject({ code: 'ROLE_NOT_ASSIGNABLE' });
  });

  it('المخطط يرفض كلمة مرور قصيرة وأدوارًا غير مسموحة أو مكررة أو فارغة', () => {
    const base = { email: 'a@b.co', password: 'a-long-password-123', roles: ['DOCTOR'] };
    expect(createUserSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, roles: ['PATIENT'] }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, roles: ['DOCTOR', 'DOCTOR'] }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, roles: [] }).success).toBe(false);
  });
});

describe('UsersService.list / get وعزل العيادات', () => {
  it('list يرجع صفحة بلا حقول سرية ولا يظهر فيها مستخدمو عيادة أخرى أو حسابات المرضى', async () => {
    const { service, repo, actor } = setup();
    repo.users.push(row({ clinicId: CLINIC_B, roles: ['DOCTOR'] }), row({ roles: ['PATIENT'] }), row({ roles: ['DOCTOR'] }));

    const page = await service.list(actor, { page: 1, pageSize: 20, sort: 'createdAt:desc' });
    expect(page.total).toBe(2);
    expect(page).toMatchObject({ page: 1, pageSize: 20 });
    expect(JSON.stringify(page)).not.toMatch(/passwordHash|failedLogins/);
  });

  it('get/update يرجعان 404 لمستخدم عيادة أخرى ولحساب مريض', async () => {
    const { service, repo, actor } = setup();
    const otherClinic = row({ clinicId: CLINIC_B, roles: ['DOCTOR'] });
    const patient = row({ roles: ['PATIENT'] });
    repo.users.push(otherClinic, patient);

    for (const target of [otherClinic, patient]) {
      await expect(service.get(actor, target.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(service.update(actor, target.id, { notifyByEmail: false })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    }
    expect(repo.audits).toEqual([]);
  });
});

describe('UsersService.update', () => {
  it('تغيير الدور: يحدّث الأدوار ويبطل الجلسات ويسجّل الأدوار السابقة والجديدة', async () => {
    const { service, repo, actor } = setup();
    const target = row({ roles: ['RECEPTIONIST'] });
    repo.users.push(target);

    const view = await service.update(actor, target.id, { roles: [UserRole.DOCTOR, UserRole.RECEPTIONIST] });

    expect(view.roles).toEqual(['DOCTOR', 'RECEPTIONIST']);
    expect(repo.revoked).toEqual([target.id]);
    expect(repo.audits).toHaveLength(1);
    expect(repo.audits[0]).toMatchObject({
      action: AuditAction.ROLE_CHANGED,
      resourceId: target.id,
      metadata: { previousRoles: ['RECEPTIONIST'], newRoles: ['DOCTOR', 'RECEPTIONIST'] },
    });
  });

  it('تغيير الدور لا يمسّ أدوارًا غير موظفين على نفس الحساب', async () => {
    const { service, repo, actor } = setup();
    const target = row({ roles: ['RECEPTIONIST', 'PATIENT'] });
    repo.users.push(target);
    await service.update(actor, target.id, { roles: [UserRole.DOCTOR] });
    expect(target.roles.map((r) => r.role).sort()).toEqual(['DOCTOR', 'PATIENT']);
  });

  it('تعديل البيانات فقط: يسجّل أسماء الحقول لا قيمها ولا يبطل الجلسات', async () => {
    const { service, repo, actor } = setup();
    const target = row({ email: 'old@clinic.test' });
    repo.users.push(target);

    const view = await service.update(actor, target.id, { email: 'new@clinic.test', notifyByEmail: false });

    expect(view.email).toBe('new@clinic.test');
    expect(repo.revoked).toEqual([]);
    expect(repo.audits).toHaveLength(1);
    expect(repo.audits[0]).toMatchObject({
      action: AuditAction.USER_UPDATED,
      metadata: { fields: ['email', 'notifyByEmail'] },
    });
    expect(JSON.stringify(repo.audits[0].metadata)).not.toContain('new@clinic.test');
    expect(repo.lockCalls).toBe(0);
  });

  it('طلب لا يغيّر شيئًا لا يكتب تدقيقًا ولا يبطل جلسات', async () => {
    const { service, repo, actor } = setup();
    const target = row({ roles: ['DOCTOR'], email: 'same@clinic.test' });
    repo.users.push(target);

    await service.update(actor, target.id, { email: 'SAME@clinic.test', roles: [UserRole.DOCTOR], status: 'ACTIVE' as never });
    expect(repo.audits).toEqual([]);
    expect(repo.revoked).toEqual([]);
  });

  it('التعطيل يبطل الجلسات ويسجّل USER_DISABLED، والتفعيل يسجّل USER_ENABLED دون إبطال', async () => {
    const { service, repo, actor } = setup();
    const target = row({ roles: ['DOCTOR'] });
    repo.users.push(target);

    const disabled = await service.update(actor, target.id, { status: 'DISABLED' as never });
    expect(disabled.status).toBe('DISABLED');
    expect(repo.revoked).toEqual([target.id]);

    const enabled = await service.update(actor, target.id, { status: 'ACTIVE' as never });
    expect(enabled.status).toBe('ACTIVE');
    expect(repo.revoked).toEqual([target.id]);
    expect(actions(repo)).toEqual([AuditAction.USER_DISABLED, AuditAction.USER_ENABLED]);
  });

  it('تغيير الدور والحالة والبريد معًا يسجّل حدثًا واحدًا لكل نوع', async () => {
    const { service, repo, actor } = setup();
    const target = row({ roles: ['RECEPTIONIST'] });
    repo.users.push(target);
    await service.update(actor, target.id, {
      roles: [UserRole.DOCTOR],
      status: 'DISABLED' as never,
      notifyByEmail: false,
    });
    expect(actions(repo).sort()).toEqual(
      [AuditAction.ROLE_CHANGED, AuditAction.USER_DISABLED, AuditAction.USER_UPDATED].sort(),
    );
  });

  it('يرفض تغيير البريد إلى بريد مستخدم آخر ويسمح بإعادة إرسال بريده نفسه', async () => {
    const { service, repo, actor } = setup();
    const target = row({ email: 'target@clinic.test' });
    const other = row({ email: 'other@clinic.test' });
    repo.users.push(target, other);

    await expect(service.update(actor, target.id, { email: 'OTHER@clinic.test' })).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    });
    await expect(service.update(actor, target.id, { email: 'target@clinic.test' })).resolves.toBeDefined();
  });

  it('المخطط يشترط حقلًا واحدًا على الأقل ويرفض الأدوار والحالات غير المعروفة', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
    expect(updateUserSchema.safeParse({ roles: ['PATIENT'] }).success).toBe(false);
    expect(updateUserSchema.safeParse({ status: 'DELETED' }).success).toBe(false);
  });
});

describe('حماية النفس وقاعدة آخر مدير', () => {
  it('المدير لا يعطّل نفسه ولا يغيّر أدواره', async () => {
    const { service, repo, actor, adminRow } = setup();
    await expect(service.update(actor, adminRow.id, { status: 'DISABLED' as never })).rejects.toMatchObject({
      code: 'CANNOT_MODIFY_SELF',
    });
    await expect(service.update(actor, adminRow.id, { roles: [UserRole.DOCTOR] })).rejects.toMatchObject({
      code: 'CANNOT_MODIFY_SELF',
    });
    expect(repo.audits).toEqual([]);
  });

  it('المدير يستطيع تعديل بياناته الشخصية', async () => {
    const { service, actor, adminRow } = setup();
    const view = await service.update(actor, adminRow.id, { notifyByEmail: false });
    expect(view.notifyByEmail).toBe(false);
  });

  it('يرفض تعطيل أو تنزيل آخر مدير فعّال (جلسة قديمة أو سباق تزامن)', async () => {
    const { service, repo, actor, adminRow } = setup();
    const staleActor: AuthenticatedUser = { ...actor, id: uid() };

    await expect(service.update(staleActor, adminRow.id, { status: 'DISABLED' as never })).rejects.toMatchObject({
      code: 'LAST_ADMIN_REQUIRED',
    });
    await expect(service.update(staleActor, adminRow.id, { roles: [UserRole.DOCTOR] })).rejects.toMatchObject({
      code: 'LAST_ADMIN_REQUIRED',
    });
    expect(repo.lockCalls).toBe(2);
    expect(repo.audits).toEqual([]);
    expect(repo.revoked).toEqual([]);
    expect(adminRow.status).toBe('ACTIVE');
  });

  it('يسمح بتنزيل مدير حين يبقى مدير فعّال آخر', async () => {
    const { service, repo, actor } = setup();
    const second = row({ roles: ['ADMIN'] });
    repo.users.push(second);
    const view = await service.update(actor, second.id, { roles: [UserRole.DOCTOR] });
    expect(view.roles).toEqual(['DOCTOR']);
  });

  it('لا يحتسب المدير المعطَّل مديرًا متبقيًا', async () => {
    const { service, repo, actor, adminRow } = setup();
    repo.users.push(row({ roles: ['ADMIN'], status: 'DISABLED' }));
    const staleActor: AuthenticatedUser = { ...actor, id: uid() };
    await expect(service.update(staleActor, adminRow.id, { status: 'DISABLED' as never })).rejects.toMatchObject({
      code: 'LAST_ADMIN_REQUIRED',
    });
  });

  it('الأخطاء استثناءات نطاقية موحّدة (AppException) بكود وحالة معروفين', async () => {
    const { service, actor } = setup();
    const error = await service.get(actor, uid()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
  });
});
