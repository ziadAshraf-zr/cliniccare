import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  AuditAction,
  UserRole,
  type AcceptInvitationDto,
  type AuthenticatedUser,
  type ChangePasswordDto,
  type LoginDto,
} from '@cliniccare/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/all-exceptions.filter';
import { LOGIN_LOCKOUT_MINUTES, LOGIN_LOCKOUT_THRESHOLD, SESSION_TTL_MINUTES } from '../../common/constants/auth.constants';
import { computeCsrfToken, generateSessionToken, hashSessionToken } from '../../common/utils/session-token.util';

/** خيارات Argon2id موحّدة؛ نفسها المستخدمة في prisma/seed (القسم 7). */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19 * 1024, timeCost: 2 } as const;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface SessionIssued {
  rawSessionToken: string;
  csrfToken: string;
  expiresAt: Date;
}

export interface LoginResult extends SessionIssued {
  user: AuthenticatedUser;
}

type UserWithRoles = {
  id: string;
  clinicId: string;
  email: string;
  preferredLocale: string;
  roles: { role: UserRole }[];
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto, meta: RequestMeta): Promise<LoginResult> {
    const clinicId = this.defaultClinicId();

    const user = await this.prisma.user.findFirst({
      where: { clinicId, email: { equals: dto.email, mode: 'insensitive' } },
      include: { roles: true },
    });

    if (!user) {
      await this.recordAudit(clinicId, null, null, AuditAction.AUTH_LOGIN_FAILED, meta, {
        attemptedEmail: dto.email,
      });
      throw new AppException('UNAUTHENTICATED', 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    // تحويل صريح: enum الدور المولَّد من @prisma/client نوع مختلف اسميًا
    // عن UserRole في @cliniccare/shared رغم تطابق القيم نصيًا.
    const roles = user.roles.map((assignment: { role: string }) => assignment.role as unknown as UserRole);

    if (user.status !== 'ACTIVE') {
      await this.recordAudit(clinicId, user.id, roles, AuditAction.AUTH_LOGIN_FAILED, meta, {
        reason: 'DISABLED',
      });
      throw new AppException('UNAUTHENTICATED', 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppException(
        'RATE_LIMITED',
        'الحساب مقفل مؤقتًا بسبب محاولات دخول فاشلة متكررة، حاول لاحقًا',
      );
    }

    const passwordOk = await argon2.verify(user.passwordHash, dto.password).catch(() => false);

    if (!passwordOk) {
      const failedLogins = user.failedLogins + 1;
      const shouldLock = failedLogins >= LOGIN_LOCKOUT_THRESHOLD;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins,
          lockedUntil: shouldLock ? new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000) : null,
        },
      });

      await this.recordAudit(
        clinicId,
        user.id,
        roles,
        shouldLock ? AuditAction.AUTH_LOCKOUT : AuditAction.AUTH_LOGIN_FAILED,
        meta,
      );

      throw new AppException('UNAUTHENTICATED', 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const session = await this.createSession(user.id, meta);
    await this.recordAudit(clinicId, user.id, roles, AuditAction.AUTH_LOGIN_SUCCESS, meta);

    return { ...session, user: this.toAuthenticatedUser(user as UserWithRoles) };
  }

  async logout(actor: AuthenticatedUser, rawSessionToken: string, meta: RequestMeta): Promise<void> {
    const hashedId = hashSessionToken(rawSessionToken);
    await this.prisma.session.updateMany({
      where: { id: hashedId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.recordAudit(actor.clinicId, actor.id, actor.roles, AuditAction.AUTH_LOGOUT, meta);
  }

  async changePassword(actor: AuthenticatedUser, dto: ChangePasswordDto, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });

    const currentOk = await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false);
    if (!currentOk) {
      throw new AppException('UNAUTHENTICATED', 'كلمة المرور الحالية غير صحيحة');
    }

    const passwordHash = await argon2.hash(dto.newPassword, ARGON2_OPTIONS);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    // إبطال كل الجلسات الأخرى بعد تغيير كلمة المرور (ممارسة أمان قياسية، القسم 7).
    await this.prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.recordAudit(actor.clinicId, actor.id, actor.roles, AuditAction.PASSWORD_CHANGED, meta);
  }

  async acceptInvitation(token: string, dto: AcceptInvitationDto, meta: RequestMeta): Promise<LoginResult> {
    const tokenHash = hashSessionToken(token);
    const invitation = await this.prisma.patientInvitation.findUnique({
      where: { tokenHash },
      include: { patient: true },
    });

    if (!invitation || invitation.usedAt || invitation.expiresAt < new Date()) {
      throw new AppException('UNAUTHENTICATED', 'رابط الدعوة غير صالح أو منتهي الصلاحية');
    }

    const dobMatches = invitation.patient.dob.toISOString().slice(0, 10) === dto.dateOfBirth;
    const phoneMatches = invitation.patient.phoneE164.endsWith(dto.phoneLast4);
    if (!dobMatches || !phoneMatches) {
      throw new AppException('UNAUTHENTICATED', 'البيانات المدخلة لا تطابق بيانات المريض');
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    // tx مُعلَّم صراحة لتفادي noImplicitAny بلا توليد أنواع Prisma الحقيقية
    // هنا (قيد بيئة التطوير الموثّق في README، لا في بيئة التشغيل الطبيعية).
    const createdUser = await this.prisma.$transaction(async (tx: PrismaService) => {
      const user = await tx.user.create({
        data: {
          clinicId: invitation.patient.clinicId,
          email: invitation.patient.email ?? `patient-${invitation.patientId}@portal.local`,
          passwordHash,
          isDemo: invitation.patient.isDemo,
        },
      });
      await tx.userRoleAssignment.create({ data: { userId: user.id, role: UserRole.PATIENT } });
      await tx.patientAccount.create({ data: { userId: user.id, patientId: invitation.patientId } });
      await tx.patientInvitation.update({ where: { id: invitation.id }, data: { usedAt: new Date() } });
      return user;
    });

    const session = await this.createSession(createdUser.id, meta);
    await this.recordAudit(
      invitation.patient.clinicId,
      createdUser.id,
      [UserRole.PATIENT],
      AuditAction.PORTAL_INVITATION_ACCEPTED,
      meta,
    );

    return {
      ...session,
      user: {
        id: createdUser.id,
        clinicId: createdUser.clinicId,
        email: createdUser.email,
        roles: [UserRole.PATIENT],
        preferredLocale: createdUser.preferredLocale,
      },
    };
  }

  // ===================== أدوات داخلية =====================

  private async createSession(userId: string, meta: RequestMeta): Promise<SessionIssued> {
    const rawSessionToken = generateSessionToken();
    const hashedId = hashSessionToken(rawSessionToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60_000);

    await this.prisma.session.create({
      data: { id: hashedId, userId, expiresAt, ip: meta.ip, userAgent: meta.userAgent },
    });

    const csrfToken = computeCsrfToken(rawSessionToken, process.env.SESSION_SECRET ?? '');
    return { rawSessionToken, csrfToken, expiresAt };
  }

  private toAuthenticatedUser(user: UserWithRoles): AuthenticatedUser {
    return {
      id: user.id,
      clinicId: user.clinicId,
      email: user.email,
      roles: user.roles.map((assignment) => assignment.role),
      preferredLocale: user.preferredLocale,
    };
  }

  private defaultClinicId(): string {
    const clinicId = process.env.DEFAULT_CLINIC_ID;
    if (!clinicId) {
      throw new AppException('INTERNAL_ERROR', 'لم يتم ضبط عيادة افتراضية (DEFAULT_CLINIC_ID)');
    }
    return clinicId;
  }

  private async recordAudit(
    clinicId: string,
    actorId: string | null,
    actorRoles: UserRole[] | null,
    action: AuditAction,
    meta: RequestMeta,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const isFailureAction =
      action === AuditAction.AUTH_LOGIN_FAILED || action === AuditAction.AUTH_LOCKOUT;

    await this.prisma.auditEvent.create({
      data: {
        clinicId,
        actorId: actorId ?? null,
        actorRole: actorRoles?.join(',') ?? null,
        action,
        resourceType: 'User',
        resourceId: actorId ?? null,
        outcome: isFailureAction ? 'FAILURE' : 'SUCCESS',
        ip: meta.ip ?? null,
        requestId: undefined,
        metadata: metadata ?? undefined,
      },
    });
  }
}
