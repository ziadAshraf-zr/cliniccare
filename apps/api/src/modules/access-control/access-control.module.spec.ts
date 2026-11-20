import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PERMISSIONS, ROLE_PERMISSIONS, UserRole, listUsersQuerySchema, userIdParamSchema } from '@cliniccare/shared';

import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { AppException } from '../../common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlModule } from './access-control.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class FakePrismaModule {}

const proto = UsersController.prototype as unknown as Record<string, () => void>;
const handlers = Object.getOwnPropertyNames(proto).filter((name) => name !== 'constructor');

describe('AccessControlModule', () => {
  it('يُركَّب مع حقن UsersService وUsersController', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [FakePrismaModule, AccessControlModule] }).compile();
    expect(moduleRef.get(UsersService)).toBeInstanceOf(UsersService);
    expect(moduleRef.get(UsersController)).toBeInstanceOf(UsersController);
  });

  it('كل مسار يتطلب user:manage (Default deny) وهي لـ ADMIN وحده في المصفوفة', () => {
    expect(handlers.sort()).toEqual(['create', 'get', 'list', 'update']);
    for (const name of handlers) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto[name])).toBe(PERMISSIONS.USER_MANAGE);
    }
    const rolesWithAccess = (Object.keys(ROLE_PERMISSIONS) as UserRole[]).filter((role) =>
      ROLE_PERMISSIONS[role].includes(PERMISSIONS.USER_MANAGE),
    );
    expect(rolesWithAccess).toEqual([UserRole.ADMIN]);
  });

  it('المسارات مطابقة للخطة: GET/POST /users وGET/PATCH /users/:id', () => {
    const route = (name: string) => ({
      method: Reflect.getMetadata(METHOD_METADATA, proto[name]) as RequestMethod,
      path: Reflect.getMetadata(PATH_METADATA, proto[name]) as string,
    });
    expect(Reflect.getMetadata(PATH_METADATA, UsersController)).toBe('users');
    expect(route('list')).toEqual({ method: RequestMethod.GET, path: '/' });
    expect(route('get')).toEqual({ method: RequestMethod.GET, path: ':id' });
    expect(route('create')).toEqual({ method: RequestMethod.POST, path: '/' });
    expect(route('update')).toEqual({ method: RequestMethod.PATCH, path: ':id' });
  });

  it('فشل التحقق يرجع VALIDATION_FAILED (422) بما فيه المعرّف غير الصالح، وللقائمة قيم افتراضية', () => {
    const listPipe = new ZodValidationPipe(listUsersQuerySchema);
    expect(listPipe.transform({})).toMatchObject({ page: 1, pageSize: 20, sort: 'createdAt:desc' });
    expect(() => listPipe.transform({ pageSize: '500' })).toThrow(AppException);

    const idPipe = new ZodValidationPipe(userIdParamSchema);
    expect(() => idPipe.transform('not-a-uuid')).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });
});
