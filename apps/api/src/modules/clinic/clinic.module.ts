import { Module } from '@nestjs/common';

import { ClinicAudit } from './clinic-audit';
import { ClinicController } from './clinic.controller';
import { ClinicRepository } from './clinic.repository';
import { ClinicService } from './clinic.service';
import { PractitionersController } from './practitioners.controller';
import { PractitionersRepository } from './practitioners.repository';
import { PractitionersService } from './practitioners.service';
import { ServiceCatalogRepository } from './service-catalog.repository';
import { ServiceCatalogService } from './service-catalog.service';
import { ServicesController } from './services.controller';

/**
 * بيانات العيادة وإعداداتها، الخدمات، الأطباء، ساعات العمل، والإجازات (القسم 2 و6).
 * المستخدمون أنفسهم يُدارون في AccessControl. PrismaModule عام فلا يُستورد.
 * يُصدّر الـ Services العامة لـ Scheduling (ساعات العمل، الإجازات، مدة الخدمة)،
 * فلا يقرأ أي Module آخر جداول هذا الـ Module أو Repositories الخاصة به.
 */
@Module({
  controllers: [ClinicController, ServicesController, PractitionersController],
  providers: [
    ClinicService,
    ServiceCatalogService,
    PractitionersService,
    ClinicRepository,
    ServiceCatalogRepository,
    PractitionersRepository,
    ClinicAudit,
  ],
  exports: [ClinicService, ServiceCatalogService, PractitionersService],
})
export class ClinicModule {}
