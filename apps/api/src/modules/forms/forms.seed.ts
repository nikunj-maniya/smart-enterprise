import type { Prisma } from '@prisma/client';
import { CORE_FORMS } from './core-forms.js';
import { publishDefinition } from './forms.service.js';

/**
 * Idempotent: seeds the four core form definitions (Leave, WFH, Visitor, IT — PRD §7)
 * for a tenant. Called from the registration accept transaction, and from the
 * core-forms backfill script for tenants activated before this change.
 *
 * A key that already has a published version is skipped, so re-running (or the
 * backfill) never creates a duplicate version.
 */
export async function seedTenantCoreForms(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
) {
  for (const form of CORE_FORMS) {
    const existing = await tx.formDefinition.findFirst({
      where: { tenantId, key: form.key, status: 'published' },
      select: { id: true },
    });
    if (existing) continue;
    await publishDefinition(tenantId, actorId, form, tx);
  }
}
