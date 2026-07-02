import { Prisma } from '@prisma/client';
import type { AuditLogEntry, AuditLogQuery, AuditLogResponse } from '@se/shared';
import { prisma } from '../../prisma.js';

export async function listAuditLog(query: AuditLogQuery): Promise<AuditLogResponse> {
  const { page, pageSize, search, action, entity, tenantId } = query;

  // Search covers entity/entityId/tenant name (tenant has a direct relation).
  // Actor name isn't searchable here — actorId has no User relation, and
  // resolving it would need an extra id-lookup query; out of scope for v1.
  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(tenantId ? { tenantId } : {}),
    ...(search
      ? {
          OR: [
            { entity: { contains: search, mode: 'insensitive' } },
            { entityId: { contains: search, mode: 'insensitive' } },
            { tenant: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter((id): id is string => !!id))];
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];

  const [tenants, actors] = await Promise.all([
    prisma.tenant.findMany({ where: { id: { in: tenantIds } } }),
    prisma.user.findMany({ where: { id: { in: actorIds } } }),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const actorById = new Map(actors.map((u) => [u.id, u]));

  return {
    rows: rows.map(
      (row): AuditLogEntry => ({
        id: row.id,
        at: row.at.toISOString(),
        actor: (row.actorId && actorById.get(row.actorId)?.name) || null,
        actorId: row.actorId,
        tenant: (row.tenantId && tenantById.get(row.tenantId)?.name) || null,
        tenantId: row.tenantId,
        entity: row.entity,
        entityId: row.entityId,
        action: row.action,
        before: row.before,
        after: row.after,
      }),
    ),
    total,
    page,
    pageSize,
  };
}
