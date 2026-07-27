import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  CreateRoleRequest,
  RoleDto,
  RolesQuery,
  RolesResponse,
  UpdateRoleRequest,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

function toDto(r: {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
  archived: boolean;
  _count: { users: number };
}): RoleDto {
  return {
    id: r.id,
    name: r.name,
    isSystem: r.isSystem,
    permissions: r.permissions,
    memberCount: r._count.users,
    archived: r.archived,
  };
}

const withCount = { _count: { select: { users: true } } } as const;

export async function listRoles(tenantId: string, query: RolesQuery): Promise<RolesResponse> {
  const { page, pageSize, search, type, archived } = query;

  const where: Prisma.RoleWhereInput = {
    tenantId,
    ...(type ? { isSystem: type === 'system' } : {}),
    ...(archived === undefined ? {} : { archived }),
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.role.findMany({
      where,
      include: withCount,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.role.count({ where }),
  ]);

  return { rows: rows.map(toDto), total, page, pageSize };
}

async function assertNameAvailable(tenantId: string, name: string, exceptId?: string) {
  const clash = await prisma.role.findFirst({
    where: {
      tenantId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
  if (clash) throw new HttpError(409, 'A role with this name already exists');
}

export async function createRole(
  tenantId: string,
  actorId: string,
  input: CreateRoleRequest,
): Promise<RoleDto> {
  await assertNameAvailable(tenantId, input.name);

  const created = await prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        tenantId,
        key: `custom-${randomBytes(6).toString('hex')}`,
        name: input.name,
        isSystem: false,
        permissions: input.permissions,
      },
      include: withCount,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Role',
        entityId: role.id,
        action: 'create',
        after: { name: role.name, permissions: role.permissions },
      },
    });
    return role;
  });

  return toDto(created);
}

export async function updateRole(
  tenantId: string,
  id: string,
  actorId: string,
  input: UpdateRoleRequest,
): Promise<RoleDto> {
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) throw new HttpError(404, 'Role not found');
  await assertNameAvailable(tenantId, input.name, id);

  // System roles are renamable, but their §4.4 permission bundle is fixed — ignore any
  // incoming permission changes and keep the seeded set.
  const nextPermissions = existing.isSystem ? existing.permissions : input.permissions;

  const updated = await prisma.$transaction(async (tx) => {
    const role = await tx.role.update({
      where: { id },
      data: { name: input.name, permissions: nextPermissions },
      include: withCount,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Role',
        entityId: role.id,
        action: 'update',
        before: { name: existing.name, permissions: existing.permissions },
        after: { name: role.name, permissions: role.permissions },
      },
    });
    return role;
  });

  return toDto(updated);
}

/** Archives or restores a custom role. System roles can't be archived. */
export async function setRoleArchived(
  tenantId: string,
  id: string,
  actorId: string,
  archived: boolean,
): Promise<RoleDto> {
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) throw new HttpError(404, 'Role not found');
  if (existing.isSystem) throw new HttpError(409, 'System roles cannot be archived');

  const updated = await prisma.$transaction(async (tx) => {
    const role = await tx.role.update({
      where: { id },
      data: { archived },
      include: withCount,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Role',
        entityId: id,
        action: archived ? 'archive' : 'unarchive',
        before: { archived: existing.archived },
        after: { archived },
      },
    });
    return role;
  });

  return toDto(updated);
}

/** The escalation-matrix row that targets this role, if any (schema.prisma `EscalationRule.toRoleId`). */
async function findEscalationReference(tenantId: string, roleId: string) {
  return prisma.escalationRule.findFirst({ where: { tenantId, toRoleId: roleId } });
}

/** The first form-picker field whose `options.roles` filter names this role's key, if any. */
async function findFormFieldReference(tenantId: string, roleKey: string) {
  const fields = await prisma.formField.findMany({
    where: { section: { form: { tenantId } }, type: 'user-picker' },
    select: { label: true, options: true, section: { select: { form: { select: { title: true } } } } },
  });
  return fields.find((f) => {
    const roles = (f.options as { roles?: unknown } | null)?.roles;
    return Array.isArray(roles) && roles.includes(roleKey);
  });
}

export async function deleteRole(tenantId: string, id: string, actorId: string): Promise<void> {
  const existing = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!existing || existing.tenantId !== tenantId) throw new HttpError(404, 'Role not found');
  if (existing.isSystem) throw new HttpError(409, 'System roles cannot be deleted');
  if (existing._count.users > 0) {
    const n = existing._count.users;
    throw new HttpError(
      409,
      `This role is assigned to ${n} member${n === 1 ? '' : 's'}. Reassign them before deleting it.`,
    );
  }

  const escalationRef = await findEscalationReference(tenantId, id);
  if (escalationRef) {
    throw new HttpError(
      409,
      `This role is the escalation target for "${escalationRef.fromContext}". Update the escalation matrix before deleting it.`,
    );
  }

  const formFieldRef = await findFormFieldReference(tenantId, existing.key);
  if (formFieldRef) {
    throw new HttpError(
      409,
      `This role is referenced by the "${formFieldRef.label}" field on the ${formFieldRef.section.form.title} form. Update that field before deleting the role.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Role',
        entityId: id,
        action: 'delete',
        before: { name: existing.name, permissions: existing.permissions },
      },
    });
  });
}
