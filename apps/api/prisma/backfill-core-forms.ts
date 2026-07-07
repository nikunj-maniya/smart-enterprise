import 'dotenv/config';
import { PrismaClient, TenantStatus } from '@prisma/client';
import { seedTenantCoreForms } from '../src/modules/forms/forms.seed.js';

const prisma = new PrismaClient();

/**
 * One-off backfill for tenants activated before the core forms shipped —
 * idempotently seeds the four core form definitions (Leave, WFH, Visitor, IT),
 * same as the accept-transaction path. Keys already published are skipped.
 */
async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { status: TenantStatus.Active },
    include: { registration: true },
  });

  for (const tenant of tenants) {
    const actorId = tenant.registration?.userId ?? tenant.registration?.reviewedBy ?? '';
    await prisma.$transaction(async (tx) => {
      await seedTenantCoreForms(tx, tenant.id, actorId);
    });
    // eslint-disable-next-line no-console
    console.log(`Backfilled core forms for tenant: ${tenant.name} (${tenant.id})`);
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
