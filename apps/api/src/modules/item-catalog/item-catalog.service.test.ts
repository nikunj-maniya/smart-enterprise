import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { createItemCatalog, deleteItemCatalog, listItemCatalog, updateItemCatalog } from './item-catalog.service.js';

/**
 * Stubbed-Prisma unit tests (forms.service.test.ts pattern): CI has no live Postgres, so the
 * `itemCatalog`, `request`, and `auditLog` delegates are redefined as in-memory stubs, plus
 * `$transaction` runs the callback against a stub `tx` exposing the same delegates.
 */

type CatalogRow = { id: string; tenantId: string; type: string; name: string; archived: boolean };

let catalogRows: CatalogRow[] = [];
let requestCount = 0;
const auditLogs: unknown[] = [];
const requestCountArgs: unknown[] = [];

Object.defineProperty(prisma, 'itemCatalog', {
  value: {
    findMany: async () => [...catalogRows].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
    findUnique: async ({ where: { tenantId_type_name } }: { where: { tenantId_type_name: { tenantId: string; type: string; name: string } } }) =>
      catalogRows.find(
        (r) =>
          r.tenantId === tenantId_type_name.tenantId &&
          r.type === tenantId_type_name.type &&
          r.name === tenantId_type_name.name,
      ) ?? null,
    findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
      const row = catalogRows.find((r) => r.id === where.id && r.tenantId === where.tenantId);
      return row ? { ...row } : null;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'request', {
  value: {
    count: async (args: unknown) => {
      requestCountArgs.push(args);
      return requestCount;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      itemCatalog: {
        create: async ({ data }: { data: { tenantId: string; type: string; name: string } }) => {
          const row: CatalogRow = { id: `id-${catalogRows.length + 1}`, archived: false, ...data };
          catalogRows.push(row);
          return row;
        },
        update: async ({ where, data }: { where: { id: string }; data: { name?: string; archived?: boolean } }) => {
          const row = catalogRows.find((r) => r.id === where.id)!;
          if (data.name !== undefined) row.name = data.name;
          if (data.archived !== undefined) row.archived = data.archived;
          return row;
        },
        delete: async ({ where }: { where: { id: string } }) => {
          catalogRows = catalogRows.filter((r) => r.id !== where.id);
        },
      },
      auditLog: { create: async ({ data }: { data: unknown }) => void auditLogs.push(data) },
    }),
  configurable: true,
});

beforeEach(() => {
  catalogRows = [];
  requestCount = 0;
  auditLogs.length = 0;
  requestCountArgs.length = 0;
});

describe('listItemCatalog', () => {
  it('returns every row (including archived), sorted by type then name, flagged with referenced', async () => {
    catalogRows = [
      { id: '1', tenantId: 't1', type: 'software', name: 'Zoom', archived: false },
      { id: '2', tenantId: 't1', type: 'hardware', name: 'Laptop', archived: true },
    ];
    requestCount = 1;

    const dtos = await listItemCatalog('t1');

    assert.deepEqual(
      dtos.map((d) => d.name),
      ['Laptop', 'Zoom'],
    );
    assert.equal(dtos[1].archived, false);
    assert.ok(dtos.every((d) => d.referenced === true));
  });

  it('flags an item unreferenced when no request has ever named it', async () => {
    catalogRows = [{ id: '1', tenantId: 't1', type: 'software', name: 'Slack', archived: false }];
    requestCount = 0;

    const dtos = await listItemCatalog('t1');

    assert.equal(dtos[0].referenced, false);
  });
});

describe('createItemCatalog', () => {
  it('rejects a duplicate (tenant, type, name) with 409', async () => {
    catalogRows = [{ id: '1', tenantId: 't1', type: 'software', name: 'Zoom', archived: false }];

    await assert.rejects(
      createItemCatalog('t1', 'actor-1', { type: 'software', name: 'Zoom' }),
      (err: unknown) => err instanceof HttpError && err.status === 409,
    );
  });

  it('creates a new unreferenced, unarchived item and writes an audit log', async () => {
    const dto = await createItemCatalog('t1', 'actor-1', { type: 'hardware', name: 'Monitor' });

    assert.equal(dto.name, 'Monitor');
    assert.equal(dto.archived, false);
    assert.equal(dto.referenced, false);
    assert.equal(auditLogs.length, 1);
    assert.deepEqual(auditLogs[0], {
      tenantId: 't1',
      actorId: 'actor-1',
      entity: 'ItemCatalog',
      entityId: dto.id,
      action: 'create',
      after: { type: 'hardware', name: 'Monitor' },
    });
  });
});

describe('updateItemCatalog', () => {
  it('rejects an unknown id with 404', async () => {
    await assert.rejects(
      updateItemCatalog('t1', 'actor-1', 'missing', { archived: true }),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('renames and archives an item, audit-logging before/after and recomputing referenced', async () => {
    catalogRows = [{ id: '1', tenantId: 't1', type: 'software', name: 'Old Name', archived: false }];
    requestCount = 1;

    const dto = await updateItemCatalog('t1', 'actor-1', '1', { name: 'New Name', archived: true });

    assert.equal(dto.name, 'New Name');
    assert.equal(dto.archived, true);
    assert.equal(dto.referenced, true);
    assert.deepEqual(auditLogs[0], {
      tenantId: 't1',
      actorId: 'actor-1',
      entity: 'ItemCatalog',
      entityId: '1',
      action: 'update',
      before: { name: 'Old Name', archived: false },
      after: { name: 'New Name', archived: true },
    });
  });

  it('does not leak another tenant\'s item (findFirst is tenant-scoped)', async () => {
    catalogRows = [{ id: '1', tenantId: 'other-tenant', type: 'software', name: 'Zoom', archived: false }];

    await assert.rejects(
      updateItemCatalog('t1', 'actor-1', '1', { archived: true }),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });
});

describe('deleteItemCatalog', () => {
  it('rejects an unknown id with 404', async () => {
    await assert.rejects(
      deleteItemCatalog('t1', 'actor-1', 'missing'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('refuses to delete a referenced item with 409 and leaves it in place', async () => {
    catalogRows = [{ id: '1', tenantId: 't1', type: 'software', name: 'Zoom', archived: false }];
    requestCount = 1;

    await assert.rejects(
      deleteItemCatalog('t1', 'actor-1', '1'),
      (err: unknown) => err instanceof HttpError && err.status === 409,
    );
    assert.equal(catalogRows.length, 1);
  });

  it('hard-deletes an unreferenced item and audit-logs it', async () => {
    catalogRows = [{ id: '1', tenantId: 't1', type: 'hardware', name: 'Old Laptop', archived: true }];
    requestCount = 0;

    await deleteItemCatalog('t1', 'actor-1', '1');

    assert.equal(catalogRows.length, 0);
    assert.deepEqual(auditLogs[0], {
      tenantId: 't1',
      actorId: 'actor-1',
      entity: 'ItemCatalog',
      entityId: '1',
      action: 'delete',
      before: { type: 'hardware', name: 'Old Laptop' },
    });
  });
});
