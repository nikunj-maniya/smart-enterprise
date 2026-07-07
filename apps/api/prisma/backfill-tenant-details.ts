import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * One-off backfill for tenants created before `industry`/`size`/`website` were
 * promoted onto `Tenant` — copies the values from their (immutable) registration
 * snapshot. Skips tenants that already have any of these set, or have no
 * registration row to copy from.
 */
async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { industry: null, size: null, website: null },
    include: { registration: true },
  });

  let updated = 0;
  for (const tenant of tenants) {
    const reg = tenant.registration;
    if (!reg) continue;
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { industry: reg.industry, size: reg.size, website: reg.website },
    });
    updated++;
    // eslint-disable-next-line no-console
    console.log(`Backfilled details for tenant: ${tenant.name} (${tenant.id})`);
  }

  // eslint-disable-next-line no-console
  console.log(`Done — backfilled ${updated} of ${tenants.length} candidate tenant(s).`);
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
