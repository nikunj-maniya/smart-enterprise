import { TenantStatus } from '@prisma/client';
import { AuditAction, RegistrationStatus, type OverviewResponse, type RecentActivity } from '@se/shared';
import { prisma } from '../../prisma.js';

const REGISTRATIONS_LIMIT = 4;
const ACTIVITY_LIMIT = 5;
const REGISTRATIONS_POOL = 50;

const ACTIVITY_ACTIONS = [
  AuditAction.Accept,
  AuditAction.Reject,
  AuditAction.Suspend,
  AuditAction.Reactivate,
];

export async function getOverview(): Promise<OverviewResponse> {
  const [pending, active, suspended, users, registrationPool, auditRows] = await Promise.all([
    prisma.tenant.count({ where: { status: TenantStatus.Pending } }),
    prisma.tenant.count({ where: { status: TenantStatus.Active } }),
    prisma.tenant.count({ where: { status: TenantStatus.Suspended } }),
    prisma.user.count({ where: { tenantId: { not: null } } }),
    prisma.enterpriseRegistration.findMany({
      orderBy: { createdAt: 'desc' },
      take: REGISTRATIONS_POOL,
    }),
    prisma.auditLog.findMany({
      where: { action: { in: ACTIVITY_ACTIONS } },
      orderBy: { at: 'desc' },
      take: ACTIVITY_LIMIT,
    }),
  ]);

  // Pending review surfaces first regardless of recency; stable sort keeps
  // createdAt-desc order within each status group.
  const registrations = [...registrationPool]
    .sort(
      (a, b) =>
        Number(a.status !== RegistrationStatus.Pending) -
        Number(b.status !== RegistrationStatus.Pending),
    )
    .slice(0, REGISTRATIONS_LIMIT);

  const tenantIds = [...new Set(auditRows.filter((r) => r.entity === 'Tenant').map((r) => r.entityId))];
  const actorIds = [...new Set(auditRows.map((r) => r.actorId).filter((id): id is string => !!id))];

  const [tenants, actors] = await Promise.all([
    prisma.tenant.findMany({ where: { id: { in: tenantIds } } }),
    prisma.user.findMany({ where: { id: { in: actorIds } } }),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const actorById = new Map(actors.map((u) => [u.id, u]));

  const recentActivity: RecentActivity[] = auditRows.map((row) => ({
    id: row.id,
    actor: (row.actorId && actorById.get(row.actorId)?.name) || 'System',
    action: row.action as AuditAction,
    target: (row.entity === 'Tenant' && tenantById.get(row.entityId)?.name) || 'Unknown',
    at: row.at.toISOString(),
  }));

  return {
    counts: { pending, active, users, suspended },
    latestRegistrations: registrations.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      contactName: r.contactName,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    recentActivity,
  };
}
