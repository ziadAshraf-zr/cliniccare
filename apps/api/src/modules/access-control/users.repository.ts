import { Injectable } from '@nestjs/common';
import { ASSIGNABLE_STAFF_ROLES, type ListUsersQuery } from '@cliniccare/shared';

import { PrismaService } from '../../prisma/prisma.service';

export interface UserRow {
  id: string;
  clinicId: string;
  email: string;
  status: string;
  failedLogins: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  preferredLocale: string;
  notifyByEmail: boolean;
  createdAt: Date;
  roles: { role: string }[];
}

/**
 * الجزء الذي يستخدمه هذا الـ Repository من PrismaClient / عميل المعاملة.
 * مُعرَّف بنيويًا حتى يبقى الـ typecheck سليمًا سواء كان Prisma Client مولَّدًا
 * (CI) أو غير مولَّد (بيئة التطوير المقيّدة الموثّقة في README).
 */
export interface UsersDb {
  user: {
    findMany(args: unknown): Promise<UserRow[]>;
    count(args: unknown): Promise<number>;
    findFirst(args: unknown): Promise<UserRow | null>;
    create(args: unknown): Promise<UserRow>;
    update(args: unknown): Promise<UserRow>;
  };
  userRoleAssignment: {
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
  session: {
    updateMany(args: unknown): Promise<unknown>;
  };
  auditEvent: {
    create(args: unknown): Promise<unknown>;
  };
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/** عميل المعاملة الذي يمرّره الـ Service لكل استدعاء Repository داخل المعاملة الواحدة. */
export type Tx = UsersDb;

export interface InsertUserData {
  clinicId: string;
  email: string;
  passwordHash: string;
  roles: string[];
  preferredLocale: string;
  notifyByEmail: boolean;
}

export interface UpdateUserFields {
  email?: string;
  status?: string;
  preferredLocale?: string;
  notifyByEmail?: boolean;
}

export interface AuditInput {
  clinicId: string;
  actorId: string;
  actorRole: string;
  action: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

const INCLUDE_ROLES = { roles: { select: { role: true } } } as const;

/**
 * "المستخدم المُدار" هو من يملك دور موظف واحدًا على الأقل. حسابات البوابة
 * (PATIENT فقط) تُدار عبر دعوات المريض لا من هذه الشاشة، فتبدو غير موجودة هنا.
 */
const MANAGED_ROLES_FILTER = { some: { role: { in: [...ASSIGNABLE_STAFF_ROLES] } } };

const SORTS: Record<ListUsersQuery['sort'], object[]> = {
  'createdAt:desc': [{ createdAt: 'desc' }, { id: 'asc' }],
  'createdAt:asc': [{ createdAt: 'asc' }, { id: 'asc' }],
  'email:asc': [{ email: 'asc' }, { id: 'asc' }],
  'email:desc': [{ email: 'desc' }, { id: 'asc' }],
  'lastLoginAt:desc': [{ lastLoginAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
};

/** P2002 من Prisma، أو unique_violation (23505) من PostgreSQL مباشرة. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string }; cause?: { code?: string } } | null;
  return e?.code === 'P2002' || e?.code === '23505' || e?.meta?.code === '23505' || e?.cause?.code === '23505';
}

/**
 * كل استعلام هنا يستلم clinicId كمعامل إلزامي (القسم 6: عزل العيادات يُفرض
 * بالنوع لا بالاجتهاد)، ولا يوجد استعلام بلا شرط عيادة.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): UsersDb {
    return this.prisma as unknown as UsersDb;
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = this.prisma as unknown as {
      $transaction<R>(callback: (tx: unknown) => Promise<R>): Promise<R>;
    };
    return client.$transaction((tx) => fn(tx as Tx));
  }

  async list(clinicId: string, query: ListUsersQuery): Promise<{ rows: UserRow[]; total: number }> {
    const where = {
      clinicId,
      roles: query.role ? { some: { role: query.role } } : MANAGED_ROLES_FILTER,
      ...(query.status ? { status: query.status } : {}),
      ...(query.query ? { email: { contains: query.query, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.user.findMany({
        where,
        include: INCLUDE_ROLES,
        orderBy: SORTS[query.sort],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.user.count({ where }),
    ]);
    return { rows, total };
  }

  findManagedById(db: UsersDb, clinicId: string, id: string): Promise<UserRow | null> {
    return db.user.findFirst({ where: { id, clinicId, roles: MANAGED_ROLES_FILTER }, include: INCLUDE_ROLES });
  }

  getManaged(clinicId: string, id: string): Promise<UserRow | null> {
    return this.findManagedById(this.db, clinicId, id);
  }

  /** غير حسّاس لحالة الحروف، ليطابق الفهرس UNIQUE(clinic_id, lower(email)). */
  findByEmail(tx: Tx, clinicId: string, email: string): Promise<UserRow | null> {
    return tx.user.findFirst({
      where: { clinicId, email: { equals: email, mode: 'insensitive' } },
      include: INCLUDE_ROLES,
    });
  }

  insert(tx: Tx, data: InsertUserData): Promise<UserRow> {
    return tx.user.create({
      data: {
        clinicId: data.clinicId,
        email: data.email,
        passwordHash: data.passwordHash,
        preferredLocale: data.preferredLocale,
        notifyByEmail: data.notifyByEmail,
        roles: { create: data.roles.map((role) => ({ role })) },
      },
      include: INCLUDE_ROLES,
    });
  }

  /** يُستدعى دائمًا (حتى بلا حقول) ليرجع الصف المحدَّث بأدواره الحالية. */
  updateFields(tx: Tx, clinicId: string, id: string, data: UpdateUserFields): Promise<UserRow> {
    return tx.user.update({ where: { id, clinicId }, data, include: INCLUDE_ROLES });
  }

  /**
   * يستبدل أدوار الموظف فقط. أي دور آخر على الحساب (مثل PATIENT) لا يُمَسّ.
   */
  async replaceStaffRoles(tx: Tx, userId: string, roles: string[]): Promise<void> {
    await tx.userRoleAssignment.deleteMany({ where: { userId, role: { in: [...ASSIGNABLE_STAFF_ROLES] } } });
    await tx.userRoleAssignment.createMany({ data: roles.map((role) => ({ userId, role })) });
  }

  /** إبطال كل جلسات المستخدم داخل نفس المعاملة (نفس طريقة Auth عند تغيير كلمة المرور). */
  async revokeSessions(tx: Tx, userId: string): Promise<void> {
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /**
   * يقفل صفوف المديرين الفعّالين في العيادة (مرتبة بـ id لتفادي deadlock)
   * ويرجع معرّفاتهم. العمليات المتزامنة التي تنزّل/تعطّل مديرًا تتسلسل هنا،
   * فتصير قاعدة "مدير فعّال واحد على الأقل" خالية من سباق التزامن.
   * استثناء موثَّق للاستعلام الخام: Prisma لا يدعم FOR UPDATE تصريحيًا.
   */
  async lockActiveAdminIds(tx: Tx, clinicId: string): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT u.id
      FROM users u
      JOIN user_roles r ON r.user_id = u.id
      WHERE u.clinic_id = ${clinicId}::uuid
        AND u.status = 'ACTIVE'
        AND r.role = 'ADMIN'
      ORDER BY u.id
      FOR UPDATE OF u`;
    return rows.map((row) => row.id);
  }

  /** حدث تدقيق داخل معاملة المستخدم نفسها (نفس جدول audit_events الذي يكتبه Auth). */
  async insertAudit(tx: Tx, event: AuditInput): Promise<void> {
    await tx.auditEvent.create({
      data: {
        clinicId: event.clinicId,
        actorId: event.actorId,
        actorRole: event.actorRole,
        action: event.action,
        resourceType: 'User',
        resourceId: event.resourceId,
        outcome: 'SUCCESS',
        metadata: event.metadata ?? undefined,
      },
    });
  }
}
