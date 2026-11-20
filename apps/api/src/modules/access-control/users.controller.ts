import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamSchema,
  type AuthenticatedUser,
  type CreateUserDto,
  type ListUsersQuery,
  type UpdateUserDto,
} from '@cliniccare/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

/**
 * إدارة المستخدمين من لوحة الإدارة (القسم 6: GET/POST /users وPATCH /users/:id).
 * كل المسارات بصلاحية user:manage (ADMIN فقط في المصفوفة). العيادة تأتي من
 * جلسة المستخدم لا من الطلب. المعرّف غير الصالح يرجع 422 لا 400، لأن الـ Filter
 * العام لا يحوّل 400 إلى كود موحّد.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission(PERMISSIONS.USER_MANAGE)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ) {
    return this.users.list(actor, query);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.USER_MANAGE)
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ZodValidationPipe(userIdParamSchema)) id: string) {
    return this.users.get(actor, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.USER_MANAGE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto,
  ) {
    return this.users.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.USER_MANAGE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(userIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }
}
