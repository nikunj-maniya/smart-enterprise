import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SYSTEM_ADMIN_EMAIL ?? 'systemadmin@smartenterprise.com';
  const password = process.env.SYSTEM_ADMIN_PASSWORD ?? 'Smart@123';

  const passwordHash = await argon2.hash(password);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'System Admin',
      passwordHash,
      status: 'Active',
      isSystemAdmin: true,
      mustChangePassword: true, // force change on first login
      tenantId: null, // platform-level, not tenant-scoped
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded System Admin: ${admin.email} (mustChangePassword=${admin.mustChangePassword})`);
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
