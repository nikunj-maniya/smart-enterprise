import type { CreateItemCatalogRequest, ItemCatalogDto, ItemCatalogType, UpdateItemCatalogRequest } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

/** The payload key each catalog type's items are submitted under (IT core form). */
const PAYLOAD_KEY: Record<ItemCatalogType, string> = {
  software: 'software_items',
  hardware: 'hardware_items',
};

async function isReferenced(tenantId: string, type: ItemCatalogType, name: string): Promise<boolean> {
  const count = await prisma.request.count({
    where: {
      tenantId,
      form: { key: 'it' },
      payload: { path: [PAYLOAD_KEY[type]], array_contains: name },
    },
  });
  return count > 0;
}

/** GET /item-catalog — the tenant's software + hardware catalogs, including archived (the admin
 *  page needs to show and un-archive them), each flagged whether any request has ever named it. */
export async function listItemCatalog(tenantId: string): Promise<ItemCatalogDto[]> {
  const rows = await prisma.itemCatalog.findMany({ where: { tenantId }, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      type: r.type as ItemCatalogType,
      name: r.name,
      archived: r.archived,
      referenced: await isReferenced(tenantId, r.type as ItemCatalogType, r.name),
    })),
  );
}

/** POST /item-catalog — add a new catalog item; appears in pickers for new requests immediately. */
export async function createItemCatalog(
  tenantId: string,
  actorId: string,
  input: CreateItemCatalogRequest,
): Promise<ItemCatalogDto> {
  const existing = await prisma.itemCatalog.findUnique({
    where: { tenantId_type_name: { tenantId, type: input.type, name: input.name } },
  });
  if (existing) throw new HttpError(409, 'An item with this name already exists in this catalog');

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.itemCatalog.create({ data: { tenantId, type: input.type, name: input.name } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'ItemCatalog',
        entityId: row.id,
        action: 'create',
        after: { type: input.type, name: input.name },
      },
    });
    return row;
  });

  return { id: created.id, type: created.type as ItemCatalogType, name: created.name, archived: false, referenced: false };
}

/** PUT /item-catalog/:id — rename and/or archive/unarchive an item, audit-logged. */
export async function updateItemCatalog(
  tenantId: string,
  actorId: string,
  id: string,
  input: UpdateItemCatalogRequest,
): Promise<ItemCatalogDto> {
  const existing = await prisma.itemCatalog.findFirst({ where: { id, tenantId } });
  if (!existing) throw new HttpError(404, 'Catalog item not found');

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.itemCatalog.update({
      where: { id },
      data: { name: input.name, archived: input.archived },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'ItemCatalog',
        entityId: id,
        action: 'update',
        before: { name: existing.name, archived: existing.archived },
        after: { name: row.name, archived: row.archived },
      },
    });
    return row;
  });

  return {
    id: updated.id,
    type: updated.type as ItemCatalogType,
    name: updated.name,
    archived: updated.archived,
    referenced: await isReferenced(tenantId, updated.type as ItemCatalogType, updated.name),
  };
}

/** DELETE /item-catalog/:id — refused (409) if any request has ever named this item (item-catalog
 *  spec: "archive instead"); otherwise a hard delete. */
export async function deleteItemCatalog(tenantId: string, actorId: string, id: string): Promise<void> {
  const existing = await prisma.itemCatalog.findFirst({ where: { id, tenantId } });
  if (!existing) throw new HttpError(404, 'Catalog item not found');

  if (await isReferenced(tenantId, existing.type as ItemCatalogType, existing.name)) {
    throw new HttpError(409, 'This item is referenced by past requests and cannot be deleted — archive it instead.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.itemCatalog.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'ItemCatalog',
        entityId: id,
        action: 'delete',
        before: { type: existing.type, name: existing.name },
      },
    });
  });
}
