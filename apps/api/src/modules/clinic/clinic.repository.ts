import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { asDb, runInTransaction, type ClinicDb, type ClinicRow, type Tx } from './clinic.db';

/** حقول العيادة القابلة للتعديل من الإعدادات. الحالة وisDemo لا تُعدَّل من هنا. */
export interface UpdateClinicFields {
  name?: string;
  timezone?: string;
  defaultLocale?: string;
}

@Injectable()
export class ClinicRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return runInTransaction(this.prisma, fn);
  }

  /** العيادة تُقرأ دائمًا بمعرّف من جلسة المستخدم، لا من الطلب. */
  findById(clinicId: string, db: ClinicDb = asDb(this.prisma)): Promise<ClinicRow | null> {
    return db.clinic.findUnique({ where: { id: clinicId } });
  }

  update(tx: Tx, clinicId: string, data: UpdateClinicFields): Promise<ClinicRow> {
    return tx.clinic.update({ where: { id: clinicId }, data });
  }
}
