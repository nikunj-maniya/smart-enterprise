import { TenantStatus } from '@prisma/client';
import { AuditAction, type EnterpriseDto } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

export async function listEnterprises(): Promise<EnterpriseDto[]> {
  const tenants = await prisma.tenant.findMany({
    where: { status: { in: [TenantStatus.Active, TenantStatus.Suspended] } },
    include: { registration: true, _count: { select: { users: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return tenants.map((t) => ({
    id: t.id,
    name: t.name,
    industry: t.registration?.industry ?? null,
    users: t._count.users,
    since: t.createdAt.toISOString(),
    status: t.status as EnterpriseDto['status'],
  }));
}

export async function suspendEnterprise(id: string, actorId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new HttpError(404, 'Enterprise not found');
  if (tenant.status !== TenantStatus.Active) {
    throw new HttpError(409, 'Only an active enterprise can be suspended');
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id }, data: { status: TenantStatus.Suspended } });
    await tx.auditLog.create({
      data: {
        tenantId: id,
        actorId,
        entity: 'Tenant',
        entityId: id,
        action: AuditAction.Suspend,
        before: { status: TenantStatus.Active },
        after: { status: TenantStatus.Suspended },
      },
    });
  });
}

export async function reactivateEnterprise(id: string, actorId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new HttpError(404, 'Enterprise not found');
  if (tenant.status !== TenantStatus.Suspended) {
    throw new HttpError(409, 'Only a suspended enterprise can be reactivated');
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id }, data: { status: TenantStatus.Active } });
    await tx.auditLog.create({
      data: {
        tenantId: id,
        actorId,
        entity: 'Tenant',
        entityId: id,
        action: AuditAction.Reactivate,
        before: { status: TenantStatus.Suspended },
        after: { status: TenantStatus.Active },
      },
    });
  });
}
