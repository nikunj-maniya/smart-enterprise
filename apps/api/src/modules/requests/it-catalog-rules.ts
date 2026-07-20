import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

/** The payload key each catalog type's items are submitted under (IT core form). */
const PAYLOAD_KEY: Record<'software' | 'hardware', string> = {
  software: 'software_items',
  hardware: 'hardware_items',
};

/**
 * Every submitted item name must be an active catalog entry for its branch (it-requests spec).
 * `forms.service.ts`'s catalog resolution now runs for submission validation too (so
 * `validatePayload` enum-checks these fields against the live catalog), but this check stays:
 * it's the one that names the offending items in a user-facing per-branch message.
 */
export async function assertItemsInActiveCatalog(
  tenantId: string,
  formKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (formKey !== 'it') return;

  for (const type of ['software', 'hardware'] as const) {
    const value = payload[PAYLOAD_KEY[type]];
    if (!Array.isArray(value) || value.length === 0) continue;
    const names = value.filter((v): v is string => typeof v === 'string');

    const active = await prisma.itemCatalog.findMany({
      where: { tenantId, type, name: { in: names }, archived: false },
      select: { name: true },
    });
    const activeNames = new Set(active.map((a) => a.name));
    const invalid = names.filter((n) => !activeNames.has(n));
    if (invalid.length > 0) {
      throw new HttpError(400, `These ${type} items are no longer available: ${invalid.join(', ')}`, {
        [PAYLOAD_KEY[type]]: [`Not available: ${invalid.join(', ')}`],
      });
    }
  }
}
