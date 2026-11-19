import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { UserRole } from '@cliniccare/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/all-exceptions.filter';
import { LOGIN_LOCKOUT_THRESHOLD } from '../../common/constants/auth.constants';
import { hashSessionToken } from '../../common/utils/session-token.util';
import { AuthService } from './auth.service';

const CLINIC_ID = '00000000-0000-4000-8000-000000000001';
const DEMO_PASSWORD = 'Passw0rd!2026';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: {
    user: {
      findFirst: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    session: { create: jest.Mock; updateMany: jest.Mock };
    auditEvent: { create: jest.Mock };
    patientInvitation: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeAll(() => {
    process.env.DEFAULT_CLINIC_ID = CLINIC_ID;
    process.env.SESSION_SECRET = 'test_session_secret_for_jest_only';
  });

  beforeEach(async () => {
    prismaMock = {
      user: { findFirst: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
      session: { create: jest.fn(), updateMany: jest.fn() },
      auditEvent: { create: jest.fn() },
      patientInvitation: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  function demoUser(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'user-1',
      clinicId: CLINIC_ID,
      email: 'doctor1@cliniccare.demo',
      status: 'ACTIVE',
      failedLogins: 0,
      lockedUntil: null,
      preferredLocale: 'ar',
      roles: [{ role: UserRole.DOCTOR }],
      ...overrides,
    };
  }

  describe('login', () => {
    it('يرفض الدخول ببريد غير موجود دون كشف ذلك، ويسجّل محاولة فاشلة', async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.login({ email: 'ghost@cliniccare.demo', password: 'anything' }, {}),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

      expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actorId: null, action: 'AUTH_LOGIN_FAILED' }),
        }),
      );
    });

    it('يرفض حسابًا معطّلًا (DISABLED) بنفس رسالة الخطأ العامة', async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce(demoUser({ status: 'DISABLED' }));

      await expect(
        service.login({ email: 'doctor1@cliniccare.demo', password: DEMO_PASSWORD }, {}),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('يرفض حسابًا مقفلًا حاليًا بكود RATE_LIMITED دون محاولة التحقق من كلمة المرور', async () => {
      const passwordHash = await argon2.hash(DEMO_PASSWORD);
      prismaMock.user.findFirst.mockResolvedValueOnce(
        demoUser({ passwordHash, lockedUntil: new Date(Date.now() + 60_000) }),
      );

      await expect(
        service.login({ email: 'doctor1@cliniccare.demo', password: 'wrong' }, {}),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('يرفض كلمة مرور خاطئة، ويزيد عدّاد المحاولات الفاشلة دون قفل قبل الوصول للحد', async () => {
      const passwordHash = await argon2.hash(DEMO_PASSWORD);
      prismaMock.user.findFirst.mockResolvedValueOnce(
        demoUser({ passwordHash, failedLogins: LOGIN_LOCKOUT_THRESHOLD - 2 }),
      );

      await expect(
        service.login({ email: 'doctor1@cliniccare.demo', password: 'wrong-password' }, {}),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedLogins: LOGIN_LOCKOUT_THRESHOLD - 1, lockedUntil: null },
      });
      expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'AUTH_LOGIN_FAILED' }) }),
      );
    });

    it('يقفل الحساب عند بلوغ عتبة المحاولات الفاشلة، ويسجّل AUTH_LOCKOUT', async () => {
      const passwordHash = await argon2.hash(DEMO_PASSWORD);
      prismaMock.user.findFirst.mockResolvedValueOnce(
        demoUser({ passwordHash, failedLogins: LOGIN_LOCKOUT_THRESHOLD - 1 }),
      );

      await expect(
        service.login({ email: 'doctor1@cliniccare.demo', password: 'wrong-password' }, {}),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

      const updateCall = prismaMock.user.update.mock.calls[0][0];
      expect(updateCall.data.failedLogins).toBe(LOGIN_LOCKOUT_THRESHOLD);
      expect(updateCall.data.lockedUntil).toBeInstanceOf(Date);
      expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'AUTH_LOCKOUT' }) }),
      );
    });

    it('ينجح بكلمة مرور صحيحة: يصفّر العدّاد، وينشئ جلسة، ويرجع مستخدمًا بلا passwordHash', async () => {
      const passwordHash = await argon2.hash(DEMO_PASSWORD, {
        type: argon2.argon2id,
        memoryCost: 19 * 1024,
        timeCost: 2,
      });
      prismaMock.user.findFirst.mockResolvedValueOnce(demoUser({ passwordHash }));
      prismaMock.session.create.mockResolvedValueOnce({});

      const result = await service.login(
        { email: 'doctor1@cliniccare.demo', password: DEMO_PASSWORD },
        { ip: '127.0.0.1', userAgent: 'jest' },
      );

      expect(result.user).toEqual({
        id: 'user-1',
        clinicId: CLINIC_ID,
        email: 'doctor1@cliniccare.demo',
        roles: [UserRole.DOCTOR],
        preferredLocale: 'ar',
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.rawSessionToken).toHaveLength(64);
      expect(result.csrfToken).toHaveLength(64);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedLogins: 0, lockedUntil: null, lastLoginAt: expect.any(Date) },
      });

      // الجلسة المخزَّنة يجب أن تحمل تجزئة SHA-256 للمعرّف الخام، لا الخام نفسه.
      const sessionCreateArg = prismaMock.session.create.mock.calls[0][0];
      expect(sessionCreateArg.data.id).toBe(hashSessionToken(result.rawSessionToken));
      expect(sessionCreateArg.data.id).not.toBe(result.rawSessionToken);

      expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'AUTH_LOGIN_SUCCESS' }) }),
      );
    });

    it('يرمي INTERNAL_ERROR إن لم يكن DEFAULT_CLINIC_ID مضبوطًا', async () => {
      const original = process.env.DEFAULT_CLINIC_ID;
      delete process.env.DEFAULT_CLINIC_ID;

      await expect(service.login({ email: 'x@x.com', password: 'y' }, {})).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });

      process.env.DEFAULT_CLINIC_ID = original;
    });
  });

  describe('logout', () => {
    it('يبطل الجلسة المطابقة فقط، ويسجّل AUTH_LOGOUT', async () => {
      const actor = {
        id: 'user-1',
        clinicId: CLINIC_ID,
        email: 'doctor1@cliniccare.demo',
        roles: [UserRole.DOCTOR],
        preferredLocale: 'ar',
      };
      const rawToken = 'a'.repeat(64);

      await service.logout(actor, rawToken, {});

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: hashSessionToken(rawToken), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'AUTH_LOGOUT' }) }),
      );
    });
  });

  describe('changePassword', () => {
    const actor = {
      id: 'user-1',
      clinicId: CLINIC_ID,
      email: 'doctor1@cliniccare.demo',
      roles: [UserRole.DOCTOR],
      preferredLocale: 'ar',
    };

    it('يرفض كلمة المرور الحالية الخاطئة ولا يعدّل شيئًا', async () => {
      const passwordHash = await argon2.hash(DEMO_PASSWORD);
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ id: 'user-1', passwordHash });

      await expect(
        service.changePassword(actor, { currentPassword: 'wrong', newPassword: 'NewPassw0rd!2026' }, {}),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });

    it('ينجح: يحدّث التجزئة، ويبطل كل الجلسات الأخرى، ويسجّل PASSWORD_CHANGED', async () => {
      const passwordHash = await argon2.hash(DEMO_PASSWORD);
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ id: 'user-1', passwordHash });

      await service.changePassword(
        actor,
        { currentPassword: DEMO_PASSWORD, newPassword: 'NewPassw0rd!2026' },
        {},
      );

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String) },
      });
      const newHash = prismaMock.user.update.mock.calls[0][0].data.passwordHash;
      await expect(argon2.verify(newHash, 'NewPassw0rd!2026')).resolves.toBe(true);

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'PASSWORD_CHANGED' }) }),
      );
    });
  });

  it('AppException يحمل كود الخطأ الموحّد (VALIDATION_FAILED/UNAUTHENTICATED/...)', () => {
    const err = new AppException('RATE_LIMITED', 'test');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err).toBeInstanceOf(Error);
  });
});
