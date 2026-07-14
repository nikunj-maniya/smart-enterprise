import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * One-off backfill for Leave/WFH forms published before the `department` field
 * carried a `{ source: 'departments' }` options marker — without it the field's
 * dropdown renders with zero options. Patches the already-published `FormField`
 * row in place (no version bump): this only corrects broken options metadata,
 * it doesn't change the field's shape or any already-submitted request values.
 */
async function main() {
  const fields = await prisma.formField.findMany({
    where: {
      key: 'department',
      section: { form: { key: { in: ['leave', 'wfh'] }, status: 'published' } },
    },
    include: { section: { include: { form: true } } },
  });

  let patched = 0;
  for (const field of fields) {
    const options = field.options as { source?: string } | null;
    if (options?.source === 'departments') continue;
    await prisma.formField.update({
      where: { id: field.id },
      data: { options: { source: 'departments' } },
    });
    patched++;
    // eslint-disable-next-line no-console
    console.log(
      `Patched department field for tenant ${field.section.form.tenantId}, form ${field.section.form.key} v${field.section.form.version}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(`Done — patched ${patched} of ${fields.length} department field(s).`);
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
