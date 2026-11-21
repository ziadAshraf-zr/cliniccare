import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createServiceSchema,
  listServicesQuerySchema,
  serviceIdParamSchema,
  updateServiceSchema,
  type AuthenticatedUser,
  type CreateServiceDto,
  type ListServicesQuery,
  type UpdateServiceDto,
} from '@cliniccare/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ServiceCatalogService } from './service-catalog.service';

/** GET/POST /services وPATCH /services/:id بصلاحية clinic:manage (القسم 6). */
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServiceCatalogService) {}

  @Get()
  @RequirePermission(PERMISSIONS.CLINIC_MANAGE)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listServicesQuerySchema)) query: ListServicesQuery,
  ) {
    return this.services.list(actor, query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.CLINIC_MANAGE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createServiceSchema)) dto: CreateServiceDto,
  ) {
    return this.services.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.CLINIC_MANAGE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(serviceIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(updateServiceSchema)) dto: UpdateServiceDto,
  ) {
    return this.services.update(actor, id, dto);
  }
}
