import { Prisma } from '@prisma/client';
import type {
  CreateDepartmentRequest,
  DepartmentDto,
  DepartmentsQuery,
  DepartmentsResponse,
  UpdateDepartmentRequest,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

function toDto(d: {
  id: string;
  name: string;
  heads: { user: { id: string; name: string } }[];
  _count: { users: number };
}): DepartmentDto {
  return {
    id: d.id,
    name: d.name,
    heads: d.heads.map((h) => ({ id: h.user.id, name: h.user.name })),
    memberCount: d._count.users,
  };
}

const withHeadsAndCount = {
  heads: { include: { user: { select: { id: true, name: true } } } },
  _count: { select: { users: true } },
} as const;

export async function listDepartments(
  tenantId: string,
  query: DepartmentsQuery,
): Promise<DepartmentsResponse> {
  const { page, pageSize, search } = query;

  const where: Prisma.DepartmentWhereInput = {
    tenantId,
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.department.findMany({
      where,
      include: withHeadsAndCount,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.department.count({ where }),
  ]);

  return { rows: rows.map(toDto), total, page, pageSize };
}

/** Every head must be an active-or-existing member of this tenant. Dedupes the input. */
async function resolveHeadIds(tenantId: string, headUserIds: string[]): Promise<string[]> {
  const unique = [...new Set(headUserIds)];
  if (unique.length === 0) return [];
  const found = await prisma.user.findMany({
    where: { id: { in: unique }, tenantId },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw new HttpError(400, 'One or more selected heads are not members of this enterprise');
  }
  return unique;
}

export async function createDepartment(
  tenantId: string,
  actorId: string,
  input: CreateDepartmentRequest,
): Promise<DepartmentDto> {
  const headIds = await resolveHeadIds(tenantId, input.headUserIds);

  const created = await prisma.$transaction(async (tx) => {
    const dept = await tx.department.create({
      data: {
        tenantId,
        name: input.name,
        heads: { create: headIds.map((userId) => ({ userId })) },
      },
      include: withHeadsAndCount,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Department',
        entityId: dept.id,
        action: 'create',
        after: { name: dept.name, headUserIds: headIds },
      },
    });
    return dept;
  });

  return toDto(created);
}

export async function updateDepartment(
  tenantId: string,
  id: string,
  actorId: string,
  input: UpdateDepartmentRequest,
): Promise<DepartmentDto> {
  const existing = await prisma.department.findUnique({
    where: { id },
    include: { heads: { select: { userId: true } } },
  });
  if (!existing || existing.tenantId !== tenantId) throw new HttpError(404, 'Department not found');
  const headIds = await resolveHeadIds(tenantId, input.headUserIds);

  const updated = await prisma.$transaction(async (tx) => {
    const dept = await tx.department.update({
      where: { id },
      data: {
        name: input.name,
        heads: { deleteMany: {}, create: headIds.map((userId) => ({ userId })) },
      },
      include: withHeadsAndCount,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Department',
        entityId: dept.id,
        action: 'update',
        before: { name: existing.name, headUserIds: existing.heads.map((h) => h.userId) },
        after: { name: dept.name, headUserIds: headIds },
      },
    });
    return dept;
  });

  return toDto(updated);
}
