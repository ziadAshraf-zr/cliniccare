import { Module } from '@nestjs/common';

import { PasswordHasher } from './password-hasher';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/**
 * إدارة المستخدمين والأدوار من لوحة الإدارة (CRUD فعلي). مصفوفة الصلاحيات
 * وسلسلة الحراس نفسها في common/guards وpackages/shared، لا هنا.
 * PrismaModule عام فلا يُستورد.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, PasswordHasher],
  exports: [UsersService],
})
export class AccessControlModule {}
