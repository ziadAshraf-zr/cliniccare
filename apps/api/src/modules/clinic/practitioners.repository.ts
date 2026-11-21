import { Injectable } from '@nestjs/common';
import type { ListPractitionersQuery, WorkingIntervalView } from '@cliniccare/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { asDb, runInTransaction, type PractitionerRow, type Tx } from './clinic.db';
import { toTimeColumn } from './clinic.serializers';

export interface InsertPractitionerData {
  userId: string;
  specialty?: string;
  licenseNo?: string;
  defaultSlotMinutes: number;
}

const INCLUDE = {
  user: { select: { email: true, status: true } },
  workingHours: { select: { weekday: true, startTime: true, endTime: true } },
} as const;

/**
 * الطبيب لا يحمل clinic_id في الجدول (القسم 4)، فعزل العيادة يمر دائمًا عبر
 * user.clinicId: كل استعلام هنا يشترطه، ولا يوجد استعلام بمعرّف طبيب وحده.
 */
@Injectable()
export class PractitionersRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return runInTransaction(this.prisma, fn);
  }

  async list(clinicId: string, query: ListPractitionersQuery): Promise<{ rows: PractitionerRow[]; total: number }> {
    const db = asDb(this.prisma);
    const where = { user: { clinicId } };
    const direction = query.sort === 'email:desc' ? 'desc' : 'asc';
    const [rows, total] = await Promise.all([
      db.practitioner.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ user: { email: direction } }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.practitioner.count({ where }),
    ]);
    return { rows, total };
  }

  findById(tx: Tx, clinicId: string, id: string): Promise<PractitionerRow | null> {
    return tx.practitioner.findFirst({ where: { id, user: { clinicId } }, include: INCLUDE });
  }

  /** طبيب فعّال (دور DOCTOR وحساب ACTIVE) داخل نفس العيادة فقط. */
  async findEligibleDoctorUser(tx: Tx, clinicId: string, userId: string): Promise<boolean> {
    const user = await tx.user.findFirst({
      where: { id: userId, clinicId, status: 'ACTIVE', roles: { some: { role: 'DOCTOR' } } },
    });
    return user !== null;
  }

  insert(tx: Tx, data: InsertPractitionerData): Promise<PractitionerRow> {
    return tx.practitioner.create({ data, include: INCLUDE });
  }

  /**
   * يقفل صف الطبيب، فيتسلسل أي استبدالان متزامنان لجدوله ولا يختلط ناتجهما.
   * استثناء موثَّق للاستعلام الخام: Prisma لا يدعم FOR UPDATE تصريحيًا (نفس سبب AccessControl).
   */
  async lockById(tx: Tx, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM practitioners WHERE id = ${id}::uuid FOR UPDATE`;
  }

  async replaceWorkingHours(tx: Tx, practitionerId: string, intervals: WorkingIntervalView[]): Promise<void> {
    await tx.workingHours.deleteMany({ where: { practitionerId } });
    if (intervals.length > 0) {
      await tx.workingHours.createMany({
        data: intervals.map((i) => ({
          practitionerId,
          weekday: i.weekday,
          startTime: toTimeColumn(i.start),
          endTime: toTimeColumn(i.end),
        })),
      });
    }
  }

  /**
   * عمود range من نوع tstzrange غير مدعوم تصريحيًا في Prisma، فالإدخال بـ SQL خام
   * (استثناء موثَّق، القسم 15). النطاق [) كما في المواعيد، فإجازة تنتهي 14:00
   * وأخرى تبدأ 14:00 لا تتعارضان. قيد الاستبعاد في القاعدة هو الفاصل عند التزامن.
   */
  async insertTimeOff(
    tx: Tx,
    practitionerId: string,
    startAt: Date,
    endAt: Date,
    reason: string | null,
  ): Promise<string> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO time_off (practitioner_id, range, reason)
      VALUES (${practitionerId}::uuid, tstzrange(${startAt}::timestamptz, ${endAt}::timestamptz, '[)'), ${reason}::text)
      RETURNING id`;
    return rows[0].id;
  }
}
