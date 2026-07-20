import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * One-off backfill for Leave forms published before the `leave_type` field
 * carried a `{ source: 'leave-types' }` options marker — without it the field
 * keeps serving the old static hardcoded option list instead of the tenant's
 * LeaveType rows. Patches the already-published `FormField` row in place (no
 * version bump): this only swaps static options for the dynamic marker, it
 * doesn't change the field's shape or any already-submitted request values
 * (requests store the leave type by name label either way).
 */
async function main() {
  const fields = await prisma.formField.findMany({
    where: {
      key: 'leave_type',
      section: { form: { key: 'leave', status: 'published' } },
    },
    include: { section: { include: { form: true } } },
  });

  let patched = 0;
  for (const field of fields) {
    const options = field.options as { source?: string } | null;
    if (options?.source === 'leave-types') continue;
    await prisma.formField.update({
      where: { id: field.id },
      data: { options: { source: 'leave-types' } },
    });
    patched++;
    // eslint-disable-next-line no-console
    console.log(
      `Patched leave_type field for tenant ${field.section.form.tenantId}, form ${field.section.form.key} v${field.section.form.version}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(`Done — patched ${patched} of ${fields.length} leave_type field(s).`);
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
