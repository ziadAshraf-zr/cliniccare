import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * الأسبوع 4 من الخطة التقنية: الدخول والخروج والجلسات وتغيير كلمة المرور
 * وقبول دعوات بوابة المريض. حراس الجلسة والصلاحيات (SessionGuard،
 * ClinicContextGuard، PermissionsGuard) مسجَّلة عامةً في app.module.ts
 * وليست هنا، لأنها تُطبَّق على كل Module لا على Auth فقط.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
