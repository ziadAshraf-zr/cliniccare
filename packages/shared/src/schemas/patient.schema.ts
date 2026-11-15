import { z } from 'zod';
import { Sex } from '../enums';

const e164 = /^\+?[1-9]\d{6,14}$/;

export const createPatientSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  dob: z.string().date(),
  sex: z.nativeEnum(Sex),
  phoneE164: z.string().regex(e164, 'رقم الهاتف غير صحيح'),
  email: z.string().email().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  emergencyContactName: z.string().max(200).optional().nullable(),
  emergencyContactPhone: z.string().regex(e164).optional().nullable(),
  /** يُرسل true بعد أن يراجع الموظف تنبيه التكرار ويقرر المتابعة (القسم 4). */
  confirmNotDuplicate: z.boolean().optional().default(false),
});
export type CreatePatientDto = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = createPatientSchema
  .omit({ confirmNotDuplicate: true })
  .partial();
export type UpdatePatientDto = z.infer<typeof updatePatientSchema>;

export const searchPatientSchema = z.object({
  query: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchPatientDto = z.infer<typeof searchPatientSchema>;
