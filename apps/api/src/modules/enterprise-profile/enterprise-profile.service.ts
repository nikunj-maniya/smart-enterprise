import type { EnterpriseDetailsDto, UpdateEnterpriseDetailsRequest } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

function toDto(t: {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  website: string | null;
}): EnterpriseDetailsDto {
  return { id: t.id, name: t.name, industry: t.industry, size: t.size, website: t.website };
}

export async function getEnterpriseDetails(tenantId: string): Promise<EnterpriseDetailsDto> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Enterprise not found');
  return toDto(tenant);
}

export async function updateEnterpriseDetails(
  tenantId: string,
  actorId: string,
  input: UpdateEnterpriseDetailsRequest,
): Promise<EnterpriseDetailsDto> {
  const before = await getEnterpriseDetails(tenantId);

  const updated = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: tenantId },
      data: {
        name: input.name,
        industry: input.industry ?? null,
        size: input.size ?? null,
        website: input.website ?? null,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Tenant',
        entityId: tenantId,
        action: 'update',
        before,
        after: toDto(tenant),
      },
    });
    return tenant;
  });

  return toDto(updated);
}
