import { SystemRoleKey, type SearchResultGroup } from '@se/shared';
import { prisma } from '../../prisma.js';
import type { AuthedUser } from '../../middleware/auth.js';

const RESULT_CAP = 5;

/**
 * §11A-consistent authorization by reuse (design.md): each searcher re-derives the same
 * tenant/role scope its owning page already enforces, so search can never surface more than
 * browsing that page would. `null` means "not applicable to this viewer" or "no matches."
 */
type Searcher = (viewer: AuthedUser, q: string) => Promise<SearchResultGroup | null>;

function group(type: SearchResultGroup['type'], label: string, items: SearchResultGroup['items']): SearchResultGroup | null {
  return items.length > 0 ? { type, label, items } : null;
}

/** Own requests only — mirrors `listMyRequests`'s `requesterId` scoping (My Requests page). */
const searchOwnRequests: Searcher = async (viewer, q) => {
  const rows = await prisma.request.findMany({
    where: { tenantId: viewer.tenantId!, requesterId: viewer.id, form: { title: { contains: q, mode: 'insensitive' } } },
    include: { form: { select: { title: true } } },
    orderBy: { createdAt: 'desc' },
    take: RESULT_CAP,
  });
  return group(
    'request',
    'My Requests',
    rows.map((r) => ({ type: 'request', id: r.id, title: r.form.title, subtitle: r.status })),
  );
};

/** Tenant users — same tenant-scoped, active-only query `directory.service.ts` uses for user pickers. */
const searchUsers: Searcher = async (viewer, q) => {
  const rows = await prisma.user.findMany({
    where: {
      tenantId: viewer.tenantId!,
      status: 'Active',
      OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }],
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
    take: RESULT_CAP,
  });
  return group(
    'user',
    'Users',
    rows.map((u) => ({ type: 'user', id: u.id, title: u.name, subtitle: u.email })),
  );
};

/** Tenant projects — same tenant-scoped, active-only query `directory.service.ts` uses for the project picker. */
const searchProjects: Searcher = async (viewer, q) => {
  const rows = await prisma.project.findMany({
    where: { tenantId: viewer.tenantId!, status: 'active', name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: RESULT_CAP,
  });
  return group(
    'project',
    'Projects',
    rows.map((p) => ({ type: 'project', id: p.id, title: p.name, subtitle: null })),
  );
};

/** Departments — Enterprise Admin only, matching the Departments page's own `requireEnterpriseAdmin` gate. */
const searchDepartments: Searcher = async (viewer, q) => {
  if (!viewer.roles.includes(SystemRoleKey.EnterpriseAdmin)) return null;
  const rows = await prisma.department.findMany({
    where: { tenantId: viewer.tenantId!, archived: false, name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: RESULT_CAP,
  });
  return group(
    'department',
    'Departments',
    rows.map((d) => ({ type: 'department', id: d.id, title: d.name, subtitle: null })),
  );
};

/** Enterprises — System Admin only, matching `enterprises.service.ts`'s own scope (Active/Suspended tenants). */
const searchEnterprises: Searcher = async (_viewer, q) => {
  const rows = await prisma.tenant.findMany({
    where: { status: { in: ['Active', 'Suspended'] }, name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true, status: true },
    orderBy: { name: 'asc' },
    take: RESULT_CAP,
  });
  return group(
    'enterprise',
    'Enterprises',
    rows.map((t) => ({ type: 'enterprise', id: t.id, title: t.name, subtitle: t.status })),
  );
};

/** Pending enterprise registrations — System Admin only, matching the Registrations queue. */
const searchRegistrations: Searcher = async (_viewer, q) => {
  const rows = await prisma.enterpriseRegistration.findMany({
    where: {
      OR: [
        { companyName: { contains: q, mode: 'insensitive' } },
        { contactName: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, companyName: true, status: true },
    orderBy: { createdAt: 'desc' },
    take: RESULT_CAP,
  });
  return group(
    'registration',
    'Registrations',
    rows.map((r) => ({ type: 'registration', id: r.id, title: r.companyName, subtitle: r.status })),
  );
};

/** Cross-tenant users — System Admin only, matching `users.service.ts`'s Platform Users listing. */
const searchPlatformUsers: Searcher = async (_viewer, q) => {
  const rows = await prisma.user.findMany({
    where: {
      tenantId: { not: null },
      OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }],
    },
    include: { tenant: { select: { name: true } } },
    orderBy: { name: 'asc' },
    take: RESULT_CAP,
  });
  return group(
    'platform-user',
    'Platform Users',
    rows.map((u) => ({ type: 'platform-user', id: u.id, title: u.name, subtitle: u.tenant?.name ?? null })),
  );
};

export const TENANT_SEARCHERS: Searcher[] = [searchOwnRequests, searchUsers, searchProjects, searchDepartments];
export const SYSTEM_ADMIN_SEARCHERS: Searcher[] = [searchEnterprises, searchRegistrations, searchPlatformUsers];
