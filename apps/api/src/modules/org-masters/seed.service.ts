import type { Prisma } from '@prisma/client';
import {
  DEFAULT_DEPARTMENT_NAMES,
  SYSTEM_ROLE_KEYS,
  SYSTEM_ROLE_NAMES,
  SYSTEM_ROLE_PERMISSIONS,
  SystemRoleKey,
} from '@se/shared';
import { HARDWARE_ITEMS, SOFTWARE_ITEMS } from '../forms/core-forms.js';

/**
 * Idempotent: seeds the System roles + default departments for a tenant.
 * Called from the registration accept transaction, and from the org-masters
 * backfill script for tenants that were activated before this change.
 */
export async function seedTenantOrgDefaults(tx: Prisma.TransactionClient, tenantId: string) {
  for (const key of SYSTEM_ROLE_KEYS) {
    // System roles carry a fixed §4.4 permission set. The update path also enforces it
    // so the backfill script corrects tenants seeded before this slice (name kept editable
    // by admins, but the seeder is the source of truth for isSystem + the baseline bundle).
    await tx.role.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: { isSystem: true, permissions: SYSTEM_ROLE_PERMISSIONS[key] },
      create: {
        tenantId,
        key,
        name: SYSTEM_ROLE_NAMES[key],
        isSystem: true,
        permissions: SYSTEM_ROLE_PERMISSIONS[key],
      },
    });
  }

  const existingDepartments = await tx.department.findMany({
    where: { tenantId, name: { in: [...DEFAULT_DEPARTMENT_NAMES] } },
    select: { name: true },
  });
  const existingNames = new Set(existingDepartments.map((d) => d.name));
  const missingDepartments = DEFAULT_DEPARTMENT_NAMES.filter((name) => !existingNames.has(name));
  if (missingDepartments.length > 0) {
    await tx.department.createMany({
      data: missingDepartments.map((name) => ({ tenantId, name })),
    });
  }
}

/**
 * PRD default escalation matrix (escalation spec): PM/Tech Lead → HR Head; HR Head → Enterprise
 * Admin. `tech_lead` is a field key, not a Role key — the Tech Lead picker field isn't
 * role-restricted (it resolves via `source: 'project-tech-leads'`), so `resolveApprovers` gives
 * it a `roleContext` of the field's own key rather than a `SystemRoleKey` (see
 * `approver-resolution.ts`'s `roleContextFor`). Process Head has no PRD-stated default; an
 * Enterprise Admin can configure one later via the escalation config API.
 */
const ESCALATION_DEFAULTS: Array<{ fromContext: string; toRole: SystemRoleKey }> = [
  { fromContext: SystemRoleKey.ProjectManager, toRole: SystemRoleKey.HrHead },
  { fromContext: 'tech_lead', toRole: SystemRoleKey.HrHead },
  { fromContext: SystemRoleKey.HrHead, toRole: SystemRoleKey.EnterpriseAdmin },
];

/** Idempotent: seeds the tenant's default escalation matrix. Must run after
 *  `seedTenantOrgDefaults` (needs the tenant's System role rows to exist). */
export async function seedTenantEscalationDefaults(tx: Prisma.TransactionClient, tenantId: string) {
  const roles = await tx.role.findMany({
    where: { tenantId, key: { in: SYSTEM_ROLE_KEYS } },
    select: { id: true, key: true },
  });
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]));

  for (const { fromContext, toRole } of ESCALATION_DEFAULTS) {
    const toRoleId = roleIdByKey.get(toRole);
    if (!toRoleId) continue;
    await tx.escalationRule.upsert({
      where: { tenantId_fromContext: { tenantId, fromContext } },
      update: {},
      create: { tenantId, fromContext, toRoleId },
    });
  }
}

/** PRD §7.1 leave types (must match the seeded Leave form's `leave_type` select options
 *  verbatim — `extractPromotedColumns` stores the submitted label as `Request.leaveTypeId`,
 *  resolved back to a real `LeaveType` row by name at balance time, not by a real FK).
 *  Quotas/toggles are sensible defaults; an Enterprise Admin edits them on the Leave Policy page. */
const LEAVE_TYPE_DEFAULTS: Array<{
  name: string;
  quota: number;
  isPaid: boolean;
  carryForward: boolean;
  halfDayAllowed: boolean;
}> = [
  { name: 'Leaves available', quota: 18, isPaid: true, carryForward: true, halfDayAllowed: true },
  { name: 'LWP', quota: 0, isPaid: false, carryForward: false, halfDayAllowed: false },
  { name: 'Becoming a father', quota: 5, isPaid: true, carryForward: false, halfDayAllowed: false },
  { name: 'Becoming a mother', quota: 90, isPaid: true, carryForward: false, halfDayAllowed: false },
  { name: 'Getting married', quota: 5, isPaid: true, carryForward: false, halfDayAllowed: false },
];

/** Idempotent: seeds the tenant's default leave types (leave-balances spec). */
export async function seedTenantLeaveTypes(tx: Prisma.TransactionClient, tenantId: string) {
  for (const lt of LEAVE_TYPE_DEFAULTS) {
    const existing = await tx.leaveType.findFirst({ where: { tenantId, name: lt.name }, select: { id: true } });
    if (existing) continue;
    await tx.leaveType.create({
      data: {
        tenantId,
        name: lt.name,
        quota: lt.quota,
        isPaid: lt.isPaid,
        accrualRule: { carryForward: lt.carryForward, halfDayAllowed: lt.halfDayAllowed },
      },
    });
  }
}

/** Calendar-year balance period (Asia/Kolkata) — annual allocation, no accrual scheduling (design.md). */
function currentLeavePeriod(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).getUTCFullYear().toString();
}

/** Idempotent: creates this year's `LeaveBalance` row (at the type's current quota) for every
 *  paid leave type the tenant has, for one user. Called on org-user creation and on the
 *  Enterprise Admin's own activation; never touches an already-existing row (a policy quota
 *  change refreshes existing balances separately — see `leave-types.service.ts`). */
export async function initializeUserLeaveBalances(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
  const period = currentLeavePeriod();
  const paidTypes = await tx.leaveType.findMany({ where: { tenantId, isPaid: true }, select: { id: true, quota: true } });
  for (const lt of paidTypes) {
    await tx.leaveBalance.upsert({
      where: { userId_leaveTypeId_period: { userId, leaveTypeId: lt.id, period } },
      update: {},
      create: { userId, leaveTypeId: lt.id, period, balance: lt.quota },
    });
  }
}

/** Idempotent: seeds the tenant's default software/hardware item catalogs (item-catalog spec)
 *  from the same lists the IT form used to embed statically. */
export async function seedTenantItemCatalog(tx: Prisma.TransactionClient, tenantId: string) {
  const rows = [
    ...SOFTWARE_ITEMS.map((name) => ({ type: 'software', name })),
    ...HARDWARE_ITEMS.map((name) => ({ type: 'hardware', name })),
  ];
  for (const row of rows) {
    await tx.itemCatalog.upsert({
      where: { tenantId_type_name: { tenantId, type: row.type, name: row.name } },
      update: {},
      create: { tenantId, type: row.type, name: row.name },
    });
  }
}

/** Grants a user the tenant's Enterprise Admin role (idempotent). */
export async function grantEnterpriseAdminRole(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
) {
  const role = await tx.role.findUniqueOrThrow({
    where: { tenantId_key: { tenantId, key: SystemRoleKey.EnterpriseAdmin } },
  });
  await tx.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });
}
