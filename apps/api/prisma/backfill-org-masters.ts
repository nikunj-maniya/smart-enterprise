import 'dotenv/config';
import { PrismaClient, TenantStatus } from '@prisma/client';
import { grantEnterpriseAdminRole, seedTenantOrgDefaults } from '../src/modules/org-masters/seed.service.js';

const prisma = new PrismaClient();

/**
 * One-off backfill for tenants activated before org-masters shipped —
 * seeds System roles + default departments and grants the pre-created
 * Enterprise Admin their role, same as the accept-transaction path.
 */
async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { status: TenantStatus.Active },
    include: { registration: true },
  });

  for (const tenant of tenants) {
    await prisma.$transaction(async (tx) => {
      await seedTenantOrgDefaults(tx, tenant.id);
      if (tenant.registration) {
        await grantEnterpriseAdminRole(tx, tenant.id, tenant.registration.userId);
      }
    });
    // eslint-disable-next-line no-console
    console.log(`Backfilled org masters for tenant: ${tenant.name} (${tenant.id})`);
  }

  // eslint-disable-next-line no-console
  console.log(`Done — backfilled ${tenants.length} active tenant(s).`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
