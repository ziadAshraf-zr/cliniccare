import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '@cliniccare/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  CSRF_HEADER_NAME,
  SESSION_ABSOLUTE_HOURS,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MINUTES,
} from '../constants/auth.constants';
import { computeCsrfToken, hashSessionToken, safeEqual } from '../utils/session-token.util';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type RequestWithAuth = Request & { user?: AuthenticatedUser; sessionRawToken?: string };

/**
 * أول حارس في السلسلة الرباعية (القسم 5 و7 من الخطة التقنية):
 * 1) يقرأ كوكي __Host-sid، يتحقق من رمز CSRF على كل طلب غير آمن.
 * 2) يبحث عن الجلسة بتجزئة المعرّف الخام (لا يُخزَّن الخام أبدًا).
 * 3) يفرض السقف المطلق للجلسة (Absolute) فوق نافذة الخمول المنزلقة (Sliding)،
 *    ويمدّدها عند كل طلب صالح.
 * 4) يضع req.user كمصدر وحيد لهوية الطالب لباقي الحراس والمتحكمات.
 * مسارات @Public() (مثل /health و/auth/login) تتجاوز هذا الحارس بالكامل.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const response = context.switchToHttp().getResponse<Response>();

    const rawToken: string | undefined = request.cookies?.[SESSION_COOKIE_NAME];
    if (!rawToken) {
      throw new UnauthorizedException('الجلسة غير موجودة، الرجاء تسجيل الدخول');
    }

    if (UNSAFE_METHODS.has(request.method)) {
      const headerToken = request.header(CSRF_HEADER_NAME);
      const expectedCsrf = computeCsrfToken(rawToken, process.env.SESSION_SECRET ?? '');
      if (!headerToken || !safeEqual(headerToken, expectedCsrf)) {
        throw new UnauthorizedException('رمز CSRF مفقود أو غير صالح');
      }
    }

    const hashedId = hashSessionToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { id: hashedId },
      include: { user: { include: { roles: true } } },
    });

    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt < now) {
      throw new UnauthorizedException('الجلسة منتهية أو غير صالحة، الرجاء تسجيل الدخول من جديد');
    }
    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('هذا الحساب غير مُفعَّل');
    }

    const absoluteDeadline = new Date(
      session.createdAt.getTime() + SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000,
    );
    if (now > absoluteDeadline) {
      await this.prisma.session.update({ where: { id: hashedId }, data: { revokedAt: now } });
      throw new UnauthorizedException('انتهت صلاحية الجلسة القصوى، الرجاء تسجيل الدخول من جديد');
    }

    const slidExpiresAt = new Date(
      Math.min(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000, absoluteDeadline.getTime()),
    );
    await this.prisma.session.update({
      where: { id: hashedId },
      data: {
        expiresAt: slidExpiresAt,
        lastSeenAt: now,
        ip: request.ip,
        userAgent: request.header('user-agent'),
      },
    });

    request.user = {
      id: session.user.id,
      clinicId: session.user.clinicId,
      email: session.user.email,
      // التحويل الصريح لأن enum الدور المولَّد من Prisma (@prisma/client) نوع
      // مختلف اسميًا عن UserRole في @cliniccare/shared رغم تطابق القيم.
      roles: session.user.roles.map(
        (assignment: { role: string }) => assignment.role as unknown as AuthenticatedUser['roles'][number],
      ),
      preferredLocale: session.user.preferredLocale,
    };
    request.sessionRawToken = rawToken;

    // تُجدَّد في كل استجابة لمسار مُصادَق حتى تتوفر للعميل دائمًا قيمة CSRF
    // حديثة دون طلب /auth/me صريح (القسم 7).
    response.cookie('csrf_token', computeCsrfToken(rawToken, process.env.SESSION_SECRET ?? ''), {
      httpOnly: false,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });

    return true;
  }
}
