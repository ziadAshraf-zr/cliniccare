import { z } from 'zod';
import { AppointmentStatus } from '../enums';

export const createAppointmentSchema = z.object({
  patientId: z.string().uuid(),
  practitionerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.string().datetime(),
});
export type CreateAppointmentDto = z.infer<typeof createAppointmentSchema>;

export const rescheduleAppointmentSchema = z.object({
  startAt: z.string().datetime(),
});
export type RescheduleAppointmentDto = z.infer<typeof rescheduleAppointmentSchema>;

export const updateAppointmentStatusSchema = z.object({
  to: z.nativeEnum(AppointmentStatus),
  reason: z.string().trim().min(1).max(500).optional(),
});
export type UpdateAppointmentStatusDto = z.infer<typeof updateAppointmentStatusSchema>;

export const availabilityQuerySchema = z.object({
  date: z.string().date(),
  serviceId: z.string().uuid(),
});
export type AvailabilityQueryDto = z.infer<typeof availabilityQuerySchema>;
