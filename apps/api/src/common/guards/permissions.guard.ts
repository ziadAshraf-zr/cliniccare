import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { roleHasPermission, type Permission } from '@cliniccare/shared';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { RequestWithAuth } from './session.guard';

/**
 * الحارس الثالث (القسم 5): Default-deny بالصلاحيات. مسار بلا
 * @RequirePermission يكفيه اجتياز SessionGuard (مُصادَق بلا قيد إضافي).
 * مسار معلَّم بها يحتاج دور واحد على الأقل من أدوار المستخدم يملكها في
 * ROLE_PERMISSIONS (مصدر الحقيقة الوحيد، packages/shared).
 * الحارس الرابع (Policy الخاص بكل مورد — مثل "طبيب يعدّل زيارته هو فقط")
 * يُنفَّذ داخل كل Service عند بناء شرط الاستعلام، وليس هنا.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const user = request.user;
    if (!user) return false;

    const allowed = user.roles.some((role) => roleHasPermission(role, required));
    if (!allowed) {
      throw new ForbiddenException('لا تملك الصلاحية اللازمة لهذا الإجراء');
    }
    return true;
  }
}
