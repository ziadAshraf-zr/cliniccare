import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, 'كلمة المرور يجب ألا تقل عن 12 حرفًا'),
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

export const acceptInvitationSchema = z.object({
  dateOfBirth: z.string().date(),
  phoneLast4: z.string().length(4).regex(/^\d{4}$/),
  password: z.string().min(12, 'كلمة المرور يجب ألا تقل عن 12 حرفًا'),
});
export type AcceptInvitationDto = z.infer<typeof acceptInvitationSchema>;
