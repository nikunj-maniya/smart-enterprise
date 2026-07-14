import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * One-off repair for requests corrupted by the `resolveEffectiveInitialStatus` bug (fixed
 * alongside this script): on a form whose status model has a legacy `Draft -> Submitted ->
 * Pending Approval` shape, a fresh submission was silently created already `Withdrawn` instead
 * of `Pending Approval`. Every request created that way has exactly one `RequestStatusHistory`
 * row, `fromState: null, toState: 'Withdrawn'` — no other code path ever writes a null
 * `fromState`, so this signature unambiguously identifies (and only identifies) a request broken
 * by that bug, never a real user-initiated withdrawal (which always transitions *from* `Pending
 * Approval`). Corrects the request back to `Pending Approval` and appends a status-history/audit
 * row documenting the repair, so its approvers (already snapshotted at submission) can decide on
 * it normally.
 */
async function main() {
  const broken = await prisma.request.findMany({
    where: { status: 'Withdrawn', statusHistory: { some: { fromState: null, toState: 'Withdrawn' } } },
    include: { statusHistory: true },
  });

  let fixed = 0;
  for (const request of broken) {
    if (request.statusHistory.length !== 1) continue; // only ever transitioned once (the bug itself)

    await prisma.$transaction([
      prisma.request.update({ where: { id: request.id }, data: { status: 'Pending Approval' } }),
      prisma.requestStatusHistory.create({
        data: {
          requestId: request.id,
          fromState: 'Withdrawn',
          toState: 'Pending Approval',
          actorId: null,
          note: 'System repair: corrected initial status corrupted by resolveEffectiveInitialStatus bug',
        },
      }),
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: null,
          entity: 'Request',
          entityId: request.id,
          action: 'transition',
          before: { status: 'Withdrawn' },
          after: { status: 'Pending Approval' },
        },
      }),
    ]);
    fixed++;
    // eslint-disable-next-line no-console
    console.log(`Repaired request ${request.id} (tenant ${request.tenantId}): Withdrawn -> Pending Approval`);
  }

  // eslint-disable-next-line no-console
  console.log(`Done — repaired ${fixed} of ${broken.length} candidate request(s).`);
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
