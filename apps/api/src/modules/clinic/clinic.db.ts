import type { PrismaService } from '../../prisma/prisma.service';

export interface ClinicRow {
  id: string;
  name: string;
  timezone: string;
  defaultLocale: string;
  status: string;
  updatedAt: Date;
}

export interface ServiceRow {
  id: string;
  clinicId: string;
  nameAr: string;
  nameEn: string;
  durationMinutes: number;
  priceCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkingHoursRow {
  weekday: number;
  /** عمود TIME في PostgreSQL: يرجع من Prisma كـ Date بتاريخ 1970-01-01 UTC. */
  startTime: Date;
  endTime: Date;
}

export interface PractitionerRow {
  id: string;
  userId: string;
  specialty: string | null;
  licenseNo: string | null;
  defaultSlotMinutes: number;
  user: { email: string; status: string };
  workingHours: WorkingHoursRow[];
}

/**
 * الجزء الذي تستخدمه وحدة Clinic من PrismaClient / عميل المعاملة، مُعرَّف بنيويًا
 * (نفس أسلوب AccessControl) ليبقى الـ typecheck سليمًا سواء كان العميل مولَّدًا أم لا.
 */
export interface ClinicDb {
  clinic: {
    findUnique(args: unknown): Promise<ClinicRow | null>;
    update(args: unknown): Promise<ClinicRow>;
  };
  service: {
    findMany(args: unknown): Promise<ServiceRow[]>;
    count(args: unknown): Promise<number>;
    findFirst(args: unknown): Promise<ServiceRow | null>;
    create(args: unknown): Promise<ServiceRow>;
    update(args: unknown): Promise<ServiceRow>;
  };
  practitioner: {
    findMany(args: unknown): Promise<PractitionerRow[]>;
    count(args: unknown): Promise<number>;
    findFirst(args: unknown): Promise<PractitionerRow | null>;
    create(args: unknown): Promise<PractitionerRow>;
  };
  workingHours: {
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
  user: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  auditEvent: {
    create(args: unknown): Promise<unknown>;
  };
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/** عميل المعاملة الذي يمرّره الـ Service لكل استدعاء Repository داخل المعاملة الواحدة. */
export type Tx = ClinicDb;

export const asDb = (prisma: PrismaService): ClinicDb => prisma as unknown as ClinicDb;

export function runInTransaction<T>(prisma: PrismaService, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = prisma as unknown as { $transaction<R>(callback: (tx: unknown) => Promise<R>): Promise<R> };
  return client.$transaction((tx) => fn(tx as Tx));
}

/** P2002 من Prisma، أو unique_violation (23505) من PostgreSQL مباشرة. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string }; cause?: { code?: string } } | null;
  return e?.code === 'P2002' || e?.code === '23505' || e?.meta?.code === '23505' || e?.cause?.code === '23505';
}

/** exclusion_violation (23P01): يظهر من Prisma $queryRaw داخل meta.code (P2010) أو مباشرة. */
export function isExclusionViolation(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string }; cause?: { code?: string } } | null;
  return e?.code === '23P01' || e?.meta?.code === '23P01' || e?.cause?.code === '23P01';
}
