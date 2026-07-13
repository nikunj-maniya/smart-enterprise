import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { Prisma, UserStatus } from '@prisma/client';
import type {
  AdminResetPasswordResponse,
  CreateOrgUserRequest,
  OrgUserDto,
  OrgUsersQuery,
  OrgUsersResponse,
  OrgUserPickerDto,
  OrgUserStats,
  UpdateOrgUserRequest,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { initializeUserLeaveBalances } from '../org-masters/seed.service.js';

const withRolesAndDepartments = {
  roles: { include: { role: { select: { id: true, name: true } } } },
  departments: { include: { department: { select: { id: true, name: true } } } },
} as const;

type OrgUserRow = Prisma.UserGetPayload<{ include: typeof withRolesAndDepartments }>;

function toDto(u: OrgUserRow): OrgUserDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status as OrgUserDto['status'],
    roles: u.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
    departments: u.departments.map((d) => ({ id: d.department.id, name: d.department.name })),
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listOrgUsers(
  tenantId: string,
  query: OrgUsersQuery,
): Promise<OrgUsersResponse> {
  const { page, pageSize, search, status, departmentId } = query;

  const where: Prisma.UserWhereInput = {
    tenantId,
    ...(status ? { status: status as UserStatus } : {}),
    ...(departmentId ? { departments: { some: { departmentId } } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: withRolesAndDepartments,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { rows: rows.map(toDto), total, page, pageSize };
}

/**
 * Lightweight tenant user list for pickers (e.g. department heads, project PM/Tech Lead).
 * Active users only; optionally restricted to holders of a given role key.
 */
export async function listOrgUserOptions(
  tenantId: string,
  roleKey?: string,
): Promise<OrgUserPickerDto[]> {
  return prisma.user.findMany({
    where: {
      tenantId,
      status: UserStatus.Active,
      ...(roleKey ? { roles: { some: { role: { key: roleKey } } } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function getOrgUserStats(tenantId: string): Promise<OrgUserStats> {
  const [active, inactive, pending, departments] = await Promise.all([
    prisma.user.count({ where: { tenantId, status: UserStatus.Active } }),
    prisma.user.count({ where: { tenantId, status: UserStatus.Inactive } }),
    prisma.user.count({ where: { tenantId, status: UserStatus.Pending } }),
    prisma.department.count({ where: { tenantId } }),
  ]);
  return { active, inactive, pending, departments };
}

/** Every id must reference a record of the given model within this tenant. */
async function assertTenantScoped(
  tenantId: string,
  ids: string[],
  model: 'role' | 'department',
  label: string,
) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return unique;
  const count =
    model === 'role'
      ? await prisma.role.count({ where: { tenantId, id: { in: unique } } })
      : await prisma.department.count({ where: { tenantId, id: { in: unique } } });
  if (count !== unique.length) {
    throw new HttpError(400, `One or more selected ${label} do not belong to this enterprise`);
  }
  return unique;
}

export async function createOrgUser(
  tenantId: string,
  actorId: string,
  input: CreateOrgUserRequest,
): Promise<OrgUserDto> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new HttpError(409, 'This email is already registered.');

  const roleIds = await assertTenantScoped(tenantId, input.roleIds, 'role', 'roles');
  const departmentIds = await assertTenantScoped(
    tenantId,
    input.departmentIds,
    'department',
    'departments',
  );

  const passwordHash = await argon2.hash(input.password);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId,
        name: input.name,
        email: input.email,
        passwordHash,
        status: UserStatus.Active,
        mustChangePassword: true, // admin sets the initial password; forced change on first login (D-30)
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
        departments: { create: departmentIds.map((departmentId) => ({ departmentId })) },
      },
      include: withRolesAndDepartments,
    });
    await initializeUserLeaveBalances(tx, tenantId, user.id);
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'User',
        entityId: user.id,
        action: 'create',
        after: { name: user.name, email: user.email, roleIds, departmentIds },
      },
    });
    return user;
  });

  return toDto(created);
}

export async function updateOrgUser(
  tenantId: string,
  id: string,
  actorId: string,
  input: UpdateOrgUserRequest,
): Promise<OrgUserDto> {
  const existing = await prisma.user.findUnique({
    where: { id },
    include: { roles: { select: { roleId: true } }, departments: { select: { departmentId: true } } },
  });
  if (!existing || existing.tenantId !== tenantId) throw new HttpError(404, 'User not found');

  const roleIds = await assertTenantScoped(tenantId, input.roleIds, 'role', 'roles');
  const departmentIds = await assertTenantScoped(
    tenantId,
    input.departmentIds,
    'department',
    'departments',
  );

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id },
      data: {
        name: input.name,
        roles: { deleteMany: {}, create: roleIds.map((roleId) => ({ roleId })) },
        departments: {
          deleteMany: {},
          create: departmentIds.map((departmentId) => ({ departmentId })),
        },
      },
      include: withRolesAndDepartments,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'User',
        entityId: id,
        action: 'update',
        before: {
          name: existing.name,
          roleIds: existing.roles.map((r) => r.roleId),
          departmentIds: existing.departments.map((d) => d.departmentId),
        },
        after: { name: user.name, roleIds, departmentIds },
      },
    });
    return user;
  });

  return toDto(updated);
}

async function findTenantUser(tenantId: string, id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.tenantId !== tenantId) throw new HttpError(404, 'User not found');
  return user;
}

/**
 * Permanently removes a user. Blocked while they hold structural assignments or have
 * history that must be preserved (§5A.1 referential integrity) — deactivate those instead.
 */
export async function deleteOrgUser(tenantId: string, id: string, actorId: string): Promise<void> {
  const user = await findTenantUser(tenantId, id);
  if (user.id === actorId) throw new HttpError(400, 'You cannot remove your own account');

  const [deptHeadCount, projectCount, requestCount] = await Promise.all([
    prisma.departmentHead.count({ where: { userId: id } }),
    prisma.projectMember.count({ where: { userId: id } }),
    prisma.request.count({ where: { requesterId: id } }),
  ]);
  if (deptHeadCount > 0) {
    throw new HttpError(
      409,
      `This user heads ${deptHeadCount} department${deptHeadCount === 1 ? '' : 's'}. Reassign the head before removing them.`,
    );
  }
  if (projectCount > 0) {
    throw new HttpError(
      409,
      `This user is assigned to ${projectCount} project${projectCount === 1 ? '' : 's'}. Remove them from those projects first.`,
    );
  }
  if (requestCount > 0) {
    throw new HttpError(
      409,
      'This user has submitted requests. Deactivate them instead so their history stays intact.',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.userDepartment.deleteMany({ where: { userId: id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'User',
        entityId: id,
        action: 'remove',
        before: { name: user.name, email: user.email },
      },
    });
  });
}

export async function deactivateOrgUser(
  tenantId: string,
  id: string,
  actorId: string,
): Promise<OrgUserDto> {
  const user = await findTenantUser(tenantId, id);
  if (user.id === actorId) throw new HttpError(400, 'You cannot deactivate your own account');
  if (user.status === UserStatus.Inactive) throw new HttpError(409, 'User is already deactivated');

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id },
      data: { status: UserStatus.Inactive },
      include: withRolesAndDepartments,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'User',
        entityId: id,
        action: 'deactivate',
        before: { status: user.status },
        after: { status: UserStatus.Inactive },
      },
    });
    return u;
  });

  return toDto(updated);
}

export async function reactivateOrgUser(
  tenantId: string,
  id: string,
  actorId: string,
): Promise<OrgUserDto> {
  const user = await findTenantUser(tenantId, id);
  if (user.status === UserStatus.Active) throw new HttpError(409, 'User is already active');

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id },
      data: { status: UserStatus.Active },
      include: withRolesAndDepartments,
    });
    await initializeUserLeaveBalances(tx, tenantId, id);
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'User',
        entityId: id,
        action: 'reactivate',
        before: { status: user.status },
        after: { status: UserStatus.Active },
      },
    });
    return u;
  });

  return toDto(updated);
}

/** Approve a pending self-registration → the user becomes Active and can log in. */
export async function approveOrgUser(
  tenantId: string,
  id: string,
  actorId: string,
): Promise<OrgUserDto> {
  const user = await findTenantUser(tenantId, id);
  if (user.status !== UserStatus.Pending) {
    throw new HttpError(409, 'Only a pending self-registration can be approved');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id },
      data: { status: UserStatus.Active },
      include: withRolesAndDepartments,
    });
    await initializeUserLeaveBalances(tx, tenantId, id);
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'User',
        entityId: id,
        action: 'approve',
        before: { status: user.status },
        after: { status: UserStatus.Active },
      },
    });
    return u;
  });

  return toDto(updated);
}

/** Reject a pending self-registration → the request is discarded, freeing the email. */
export async function rejectOrgUser(tenantId: string, id: string, actorId: string): Promise<void> {
  const user = await findTenantUser(tenantId, id);
  if (user.status !== UserStatus.Pending) {
    throw new HttpError(409, 'Only a pending self-registration can be rejected');
  }

  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.userDepartment.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'User',
        entityId: id,
        action: 'reject_self_registration',
        before: { name: user.name, email: user.email },
      },
    });
  });
}

export async function resetOrgUserPassword(
  tenantId: string,
  id: string,
  actorId: string,
): Promise<AdminResetPasswordResponse> {
  await findTenantUser(tenantId, id);

  const temporaryPassword = randomBytes(9).toString('base64url');
  const passwordHash = await argon2.hash(temporaryPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } }),
    prisma.auditLog.create({
      data: { tenantId, actorId, entity: 'User', entityId: id, action: 'password_reset' },
    }),
  ]);

  return { temporaryPassword };
}
