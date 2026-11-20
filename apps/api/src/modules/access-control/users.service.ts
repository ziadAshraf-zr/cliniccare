import { Injectable } from '@nestjs/common';
import {
  ASSIGNABLE_STAFF_ROLES,
  AuditAction,
  UserStatus,
  type AuthenticatedUser,
  type CreateUserDto,
  type ListUsersQuery,
  type Paginated,
  type UpdateUserDto,
  type UserAdminView,
} from '@cliniccare/shared';

import { PasswordHasher } from './password-hasher';
import {
  assertClinicKeepsActiveAdmin,
  assertNotChangingOwnAccess,
  assertRolesAssignable,
} from './policies/user-management.policy';
import { toUserAdminView } from './user-admin.serializer';
import { EmailTakenException, UserNotFoundException } from './user.exceptions';
import { isUniqueViolation, UsersRepository, type Tx, type UpdateUserFields, type UserRow } from './users.repository';

const STAFF: readonly string[] = ASSIGNABLE_STAFF_ROLES;
const sorted = (roles: readonly string[]) => [...roles].sort();
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * إدارة المستخدمين من لوحة الإدارة (AccessControl). كل عملية كتابة تتم في
 * معاملة واحدة تشمل التعديل وحدث التدقيق وإبطال الجلسات، فلا يوجد تغيير بلا أثر.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async list(actor: AuthenticatedUser, query: ListUsersQuery): Promise<Paginated<UserAdminView>> {
    const { rows, total } = await this.repo.list(actor.clinicId, query);
    return { items: rows.map(toUserAdminView), page: query.page, pageSize: query.pageSize, total };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<UserAdminView> {
    const row = await this.repo.getManaged(actor.clinicId, id);
    if (!row) throw new UserNotFoundException();
    return toUserAdminView(row);
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto): Promise<UserAdminView> {
    assertRolesAssignable(dto.roles);
    // التجزئة خارج المعاملة: Argon2id ثقيل ولا يجب أن يحجز اتصال قاعدة بيانات.
    const passwordHash = await this.hasher.hash(dto.password);
    const roles = sorted(dto.roles);

    const row = await this.repo.transaction(async (tx) => {
      if (await this.repo.findByEmail(tx, actor.clinicId, dto.email)) throw new EmailTakenException();

      let created: UserRow;
      try {
        created = await this.repo.insert(tx, {
          clinicId: actor.clinicId,
          email: dto.email,
          passwordHash,
          roles,
          preferredLocale: dto.preferredLocale,
          notifyByEmail: dto.notifyByEmail,
        });
      } catch (error) {
        // شبكة أمان للفهرس UNIQUE(clinic_id, lower(email)) عند طلبين متزامنين.
        if (isUniqueViolation(error)) throw new EmailTakenException();
        throw error;
      }

      await this.audit(tx, actor, AuditAction.USER_CREATED, created.id, { roles });
      return created;
    });
    return toUserAdminView(row);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto): Promise<UserAdminView> {
    if (dto.roles) assertRolesAssignable(dto.roles);
    const touchesAccess = dto.roles !== undefined || dto.status !== undefined;

    const row = await this.repo.transaction(async (tx) => {
      // قفل المديرين الفعّالين قبل قراءة الهدف، فيجري فحص "آخر مدير" على حالة
      // لا يستطيع طلب متزامن تغييرها.
      const lockedAdminIds = touchesAccess ? await this.repo.lockActiveAdminIds(tx, actor.clinicId) : [];

      const current = await this.repo.findManagedById(tx, actor.clinicId, id);
      if (!current) throw new UserNotFoundException();

      const currentRoles = sorted(current.roles.map((r) => r.role).filter((role) => STAFF.includes(role)));
      const newRoles = dto.roles ? sorted(dto.roles) : currentRoles;
      const rolesChanged = !sameList(currentRoles, newRoles);
      const statusChanged = dto.status !== undefined && dto.status !== current.status;

      const profile: UpdateUserFields = {};
      const changedFields: string[] = [];
      if (dto.email !== undefined && dto.email.toLowerCase() !== current.email.toLowerCase()) {
        profile.email = dto.email.toLowerCase();
        changedFields.push('email');
      }
      if (dto.preferredLocale !== undefined && dto.preferredLocale !== current.preferredLocale) {
        profile.preferredLocale = dto.preferredLocale;
        changedFields.push('preferredLocale');
      }
      if (dto.notifyByEmail !== undefined && dto.notifyByEmail !== current.notifyByEmail) {
        profile.notifyByEmail = dto.notifyByEmail;
        changedFields.push('notifyByEmail');
      }

      // لا تغيير فعلي: لا كتابة ولا حدث تدقيق ولا إبطال جلسات.
      if (!rolesChanged && !statusChanged && changedFields.length === 0) return current;

      assertNotChangingOwnAccess(actor.id, id, rolesChanged || statusChanged);
      assertClinicKeepsActiveAdmin({
        targetId: id,
        targetWasActiveAdmin: current.status === UserStatus.ACTIVE && currentRoles.includes('ADMIN'),
        targetStaysActiveAdmin: (dto.status ?? current.status) === UserStatus.ACTIVE && newRoles.includes('ADMIN'),
        lockedAdminIds,
      });

      if (profile.email) {
        const other = await this.repo.findByEmail(tx, actor.clinicId, profile.email);
        if (other && other.id !== id) throw new EmailTakenException();
      }

      if (rolesChanged) await this.repo.replaceStaffRoles(tx, id, newRoles);

      let updated: UserRow;
      try {
        updated = await this.repo.updateFields(tx, actor.clinicId, id, {
          ...profile,
          ...(statusChanged ? { status: dto.status } : {}),
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new EmailTakenException();
        throw error;
      }

      // الدور الجديد أو الحساب المعطَّل يسري فورًا لا عند انتهاء الجلسة (القسم 5).
      if (rolesChanged || (statusChanged && dto.status === UserStatus.DISABLED)) {
        await this.repo.revokeSessions(tx, id);
      }

      if (rolesChanged) {
        await this.audit(tx, actor, AuditAction.ROLE_CHANGED, id, { previousRoles: currentRoles, newRoles });
      }
      if (statusChanged) {
        const action = dto.status === UserStatus.DISABLED ? AuditAction.USER_DISABLED : AuditAction.USER_ENABLED;
        await this.audit(tx, actor, action, id, { previousStatus: current.status, newStatus: dto.status });
      }
      if (changedFields.length > 0) {
        // أسماء الحقول فقط لا قيمها (البريد بيانات شخصية، القسم 10).
        await this.audit(tx, actor, AuditAction.USER_UPDATED, id, { fields: changedFields });
      }
      return updated;
    });
    return toUserAdminView(row);
  }

  private audit(
    tx: Tx,
    actor: AuthenticatedUser,
    action: AuditAction,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.repo.insertAudit(tx, {
      clinicId: actor.clinicId,
      actorId: actor.id,
      actorRole: actor.roles.join(','),
      action,
      resourceId,
      metadata,
    });
  }
}
