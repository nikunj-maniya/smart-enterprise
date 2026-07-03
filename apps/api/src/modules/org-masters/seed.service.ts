import type { Prisma } from '@prisma/client';
import {
  DEFAULT_DEPARTMENT_NAMES,
  SYSTEM_ROLE_KEYS,
  SYSTEM_ROLE_NAMES,
  SystemRoleKey,
} from '@se/shared';

/**
 * Idempotent: seeds the System roles + default departments for a tenant.
 * Called from the registration accept transaction, and from the org-masters
 * backfill script for tenants that were activated before this change.
 */
export async function seedTenantOrgDefaults(tx: Prisma.TransactionClient, tenantId: string) {
  for (const key of SYSTEM_ROLE_KEYS) {
    await tx.role.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: {},
      create: { tenantId, key, name: SYSTEM_ROLE_NAMES[key], permissions: [] },
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
