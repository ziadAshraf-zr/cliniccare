import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import { PrismaModule } from './prisma/prisma.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { SessionGuard } from './common/guards/session.guard';
import { ClinicContextGuard } from './common/guards/clinic-context.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { ClinicModule } from './modules/clinic/clinic.module';
import { PatientModule } from './modules/patient/patient.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { ClinicalModule } from './modules/clinical/clinical.module';
import { DocumentModule } from './modules/document/document.module';
import { PortalModule } from './modules/portal/portal.module';
import { ConsentAuditModule } from './modules/consent-audit/consent-audit.module';
import { InteropModule } from './modules/interop/interop.module';
import { NotificationModule } from './modules/notification/notification.module';

/**
 * 11 Module منطقية داخل Monolith واحد (القسم 2 و3 من الخطة التقنية).
 * كل Module يتعامل مع غيره عبر الـ Service العام له فقط، لا عبر
 * Repository تابع لـ Module آخر.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req: IncomingMessage) => (req as IncomingMessage & { id?: string }).id ?? randomUUID(),
        // لا تُسجَّل أجسام الطلبات إطلاقًا، وتُخفى الحقول الحساسة (القسم 13).
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.body',
            'res.headers["set-cookie"]',
          ],
          remove: true,
        },
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    PrismaModule,

    HealthModule,
    AuthModule,
    AccessControlModule,
    ClinicModule,
    PatientModule,
    SchedulingModule,
    ClinicalModule,
    DocumentModule,
    PortalModule,
    ConsentAuditModule,
    InteropModule,
    NotificationModule,
  ],
  providers: [
    // السلسلة الرباعية بالترتيب (القسم 5 و7): جلسة ← سياق عيادة ← صلاحية.
    // الحارس الرابع (Policy الخاص بمورد) يُنفَّذ داخل كل Service لا هنا.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: ClinicContextGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
