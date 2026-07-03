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
  headUserId: string | null;
  head: { name: string } | null;
  _count: { users: number };
}): DepartmentDto {
  return {
    id: d.id,
    name: d.name,
    headUserId: d.headUserId,
    headName: d.head?.name ?? null,
    memberCount: d._count.users,
  };
}

const withHeadAndCount = {
  head: { select: { name: true } },
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
      include: withHeadAndCount,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.department.count({ where }),
  ]);

  return { rows: rows.map(toDto), total, page, pageSize };
}

async function assertHeadBelongsToTenant(tenantId: string, headUserId: string) {
  const head = await prisma.user.findUnique({ where: { id: headUserId } });
  if (!head || head.tenantId !== tenantId) {
    throw new HttpError(400, 'Selected department head is not a member of this enterprise');
  }
}

export async function createDepartment(
  tenantId: string,
  actorId: string,
  input: CreateDepartmentRequest,
): Promise<DepartmentDto> {
  if (input.headUserId) await assertHeadBelongsToTenant(tenantId, input.headUserId);

  const created = await prisma.$transaction(async (tx) => {
    const dept = await tx.department.create({
      data: { tenantId, name: input.name, headUserId: input.headUserId ?? null },
      include: withHeadAndCount,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Department',
        entityId: dept.id,
        action: 'create',
        after: { name: dept.name, headUserId: dept.headUserId },
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
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) throw new HttpError(404, 'Department not found');
  if (input.headUserId) await assertHeadBelongsToTenant(tenantId, input.headUserId);

  const updated = await prisma.$transaction(async (tx) => {
    const dept = await tx.department.update({
      where: { id },
      data: { name: input.name, headUserId: input.headUserId ?? null },
      include: withHeadAndCount,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Department',
        entityId: dept.id,
        action: 'update',
        before: { name: existing.name, headUserId: existing.headUserId },
        after: { name: dept.name, headUserId: dept.headUserId },
      },
    });
    return dept;
  });

  return toDto(updated);
}
