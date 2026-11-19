import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { AppException } from '../filters/all-exceptions.filter';

/**
 * يستخدم مخططات Zod من @cliniccare/shared مباشرة كمصدر حقيقة وحيد للتحقق
 * (نفس المخطط يُستخدم لاحقًا في apps/web على جانب العميل، القسم 6).
 * عند الفشل يرمي AppException بشكل الخطأ الموحّد (VALIDATION_FAILED، 422)
 * بدل اعتماد class-validator/DTOs منفصلة.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      throw new AppException('VALIDATION_FAILED', 'بيانات الطلب غير صالحة', fieldErrors);
    }
    return result.data;
  }
}
