import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '@cliniccare/shared';

/**
 * يستخرج المستخدم الذي وضعه SessionGuard على الطلب. لا يُستخدم إلا في مسار
 * مُصادَق (غير معلَّم Public)، وإلا يكون undefined.
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request as Request & { user: AuthenticatedUser }).user;
  },
);
