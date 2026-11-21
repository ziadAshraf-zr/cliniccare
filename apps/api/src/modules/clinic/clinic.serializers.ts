import type {
  ClinicView,
  PractitionerView,
  ServiceView,
  TimeOffView,
  Weekday,
  WorkingIntervalView,
} from '@cliniccare/shared';

import type { ClinicRow, PractitionerRow, ServiceRow, WorkingHoursRow } from './clinic.db';

/** "09:30" ← عمود TIME. Prisma يمثّله Date على 1970-01-01 بتوقيت UTC. */
export const fromTimeColumn = (value: Date): string => value.toISOString().slice(11, 16);
export const toTimeColumn = (value: string): Date => new Date(`1970-01-01T${value}:00.000Z`);

export const toClinicView = (row: ClinicRow): ClinicView => ({
  id: row.id,
  name: row.name,
  timezone: row.timezone,
  defaultLocale: row.defaultLocale,
  status: row.status,
  updatedAt: row.updatedAt.toISOString(),
});

export const toServiceView = (row: ServiceRow): ServiceView => ({
  id: row.id,
  nameAr: row.nameAr,
  nameEn: row.nameEn,
  durationMinutes: row.durationMinutes,
  priceCents: row.priceCents,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toWorkingIntervals = (rows: WorkingHoursRow[]): WorkingIntervalView[] =>
  rows
    .map((r) => ({ weekday: r.weekday as Weekday, start: fromTimeColumn(r.startTime), end: fromTimeColumn(r.endTime) }))
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));

export const toPractitionerView = (row: PractitionerRow): PractitionerView => ({
  id: row.id,
  userId: row.userId,
  email: row.user.email,
  userStatus: row.user.status,
  specialty: row.specialty,
  licenseNo: row.licenseNo,
  defaultSlotMinutes: row.defaultSlotMinutes,
  workingHours: toWorkingIntervals(row.workingHours),
});

export const toTimeOffView = (row: { id: string; startAt: Date; endAt: Date; reason: string | null }): TimeOffView => ({
  id: row.id,
  startAt: row.startAt.toISOString(),
  endAt: row.endAt.toISOString(),
  reason: row.reason,
});
