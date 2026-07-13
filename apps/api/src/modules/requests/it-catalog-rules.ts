import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

/** The payload key each catalog type's items are submitted under (IT core form). */
const PAYLOAD_KEY: Record<'software' | 'hardware', string> = {
  software: 'software_items',
  hardware: 'hardware_items',
};

/**
 * Item selection isn't statically validated at compile time (a catalog-sourced field's options
 * aren't known until this DB lookup — see `forms.service.ts`'s catalog resolution, which only
 * runs for *rendering*, not submission). This is the authoritative check: every submitted item
 * name must be an active catalog entry for its branch (it-requests spec).
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
