import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createPractitionerSchema,
  createTimeOffSchema,
  listPractitionersQuerySchema,
  practitionerIdParamSchema,
  replaceWorkingHoursSchema,
  type AuthenticatedUser,
  type CreatePractitionerDto,
  type CreateTimeOffDto,
  type ListPractitionersQuery,
  type ReplaceWorkingHoursDto,
} from '@cliniccare/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PractitionersService } from './practitioners.service';

/**
 * القسم 6: GET/POST /practitioners بصلاحية user:manage، وPUT working-hours
 * وPOST time-off بصلاحية clinic:manage.
 */
@Controller('practitioners')
export class PractitionersController {
  constructor(private readonly practitioners: PractitionersService) {}

  @Get()
  @RequirePermission(PERMISSIONS.USER_MANAGE)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listPractitionersQuerySchema)) query: ListPractitionersQuery,
  ) {
    return this.practitioners.list(actor, query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.USER_MANAGE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPractitionerSchema)) dto: CreatePractitionerDto,
  ) {
    return this.practitioners.create(actor, dto);
  }

  @Put(':id/working-hours')
  @RequirePermission(PERMISSIONS.CLINIC_MANAGE)
  replaceWorkingHours(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(practitionerIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(replaceWorkingHoursSchema)) dto: ReplaceWorkingHoursDto,
  ) {
    return this.practitioners.replaceWorkingHours(actor, id, dto);
  }

  @Post(':id/time-off')
  @RequirePermission(PERMISSIONS.CLINIC_MANAGE)
  addTimeOff(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(practitionerIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(createTimeOffSchema)) dto: CreateTimeOffDto,
  ) {
    return this.practitioners.addTimeOff(actor, id, dto);
  }
}
