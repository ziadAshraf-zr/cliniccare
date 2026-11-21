import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PERMISSIONS, updateClinicSchema, type AuthenticatedUser, type UpdateClinicDto } from '@cliniccare/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ClinicService } from './clinic.service';

/** GET/PATCH /clinic بصلاحية clinic:manage. العيادة من جلسة المستخدم لا من الطلب. */
@Controller('clinic')
export class ClinicController {
  constructor(private readonly clinic: ClinicService) {}

  @Get()
  @RequirePermission(PERMISSIONS.CLINIC_MANAGE)
  get(@CurrentUser() actor: AuthenticatedUser) {
    return this.clinic.get(actor);
  }

  @Patch()
  @RequirePermission(PERMISSIONS.CLINIC_MANAGE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateClinicSchema)) dto: UpdateClinicDto,
  ) {
    return this.clinic.update(actor, dto);
  }
}
