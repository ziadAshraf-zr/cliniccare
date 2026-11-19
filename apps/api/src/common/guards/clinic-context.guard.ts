import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { RequestWithAuth } from './session.guard';

/**
 * الحارس الثاني في السلسلة (القسم 3 و13): يثبّت سياق العيادة الحالي من
 * المستخدم المصادَق، ويرفض أي محاولة انتحال عيادة أخرى عبر ترويسة
 * X-Clinic-Id. عيادة واحدة فقط مفعّلة بالعرض التجريبي حاليًا، لكن الحارس
 * يفرض العزل منذ الآن استعدادًا لتعدد العيادات لاحقًا.
 */
@Injectable()
export class ClinicContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth & { clinicId?: string }>();
    const user = request.user;
    if (!user) return true; // SessionGuard يسبقه ويرفض أصلًا لو مفيش مستخدم

    const requestedClinicId = request.header('x-clinic-id');
    if (requestedClinicId && requestedClinicId !== user.clinicId) {
      throw new ForbiddenException('لا يمكن الوصول إلى بيانات عيادة أخرى');
    }

    request.clinicId = user.clinicId;
    return true;
  }
}
