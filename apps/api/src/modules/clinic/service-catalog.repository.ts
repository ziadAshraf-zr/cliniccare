import { Injectable } from '@nestjs/common';
import type { ListServicesQuery } from '@cliniccare/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { asDb, runInTransaction, type ServiceRow, type Tx } from './clinic.db';

export interface ServiceFields {
  nameAr: string;
  nameEn: string;
  durationMinutes: number;
  priceCents: number;
}

const SORTS: Record<ListServicesQuery['sort'], object[]> = {
  'nameAr:asc': [{ nameAr: 'asc' }, { id: 'asc' }],
  'nameEn:asc': [{ nameEn: 'asc' }, { id: 'asc' }],
  'createdAt:desc': [{ createdAt: 'desc' }, { id: 'asc' }],
};

/** كل استعلام يستلم clinicId كمعامل إلزامي (عزل العيادات يُفرض بالنوع، القسم 6). */
@Injectable()
export class ServiceCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return runInTransaction(this.prisma, fn);
  }

  async list(clinicId: string, query: ListServicesQuery): Promise<{ rows: ServiceRow[]; total: number }> {
    const db = asDb(this.prisma);
    const where = { clinicId };
    const [rows, total] = await Promise.all([
      db.service.findMany({
        where,
        orderBy: SORTS[query.sort],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.service.count({ where }),
    ]);
    return { rows, total };
  }

  findById(tx: Tx, clinicId: string, id: string): Promise<ServiceRow | null> {
    return tx.service.findFirst({ where: { id, clinicId } });
  }

  insert(tx: Tx, clinicId: string, data: ServiceFields): Promise<ServiceRow> {
    return tx.service.create({ data: { clinicId, ...data } });
  }

  update(tx: Tx, clinicId: string, id: string, data: Partial<ServiceFields>): Promise<ServiceRow> {
    return tx.service.update({ where: { id, clinicId }, data });
  }
}
