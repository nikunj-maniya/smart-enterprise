import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import type { AuditLogQuery } from '@se/shared';
import { listAuditLog } from './audit-log.service.js';

/**
 * Stubbed-Prisma suite (forms.service.test.ts pattern): PrismaClient exposes its delegates via a
 * proxy `get` trap, so `mock.method` can't see them — redefine every delegate this service reads
 * as stubs backed by the mutable rows below, reset in `beforeEach`.
 */

type LogRow = {
  id: string;
  tenantId: string | null;
  actorId: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  at: Date;
};

let logRows: LogRow[] = [];
let logTotal = 0;
let tenantRows: { id: string; name: string }[] = [];
let actorRows: { id: string; name: string }[] = [];

const calls = {
  findMany: [] as unknown[],
  count: [] as unknown[],
  tenantFindMany: [] as unknown[],
  userFindMany: [] as unknown[],
};

Object.defineProperty(prisma, 'auditLog', {
  value: {
    findMany: async (args: unknown) => {
      calls.findMany.push(args);
      return logRows;
    },
    count: async (args: unknown) => {
      calls.count.push(args);
      return logTotal;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'tenant', {
  value: {
    findMany: async (args: unknown) => {
      calls.tenantFindMany.push(args);
      return tenantRows;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: {
    findMany: async (args: unknown) => {
      calls.userFindMany.push(args);
      return actorRows;
    },
  },
  configurable: true,
});

function logRow(overrides: Partial<LogRow> = {}): LogRow {
  return {
    id: 'a1',
    tenantId: 't1',
    actorId: 'u1',
    entity: 'User',
    entityId: 'e1',
    action: 'update',
    before: null,
    after: null,
    at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function baseQuery(overrides: Partial<AuditLogQuery> = {}): AuditLogQuery {
  return { page: 1, pageSize: 20, ...overrides };
}

beforeEach(() => {
  logRows = [];
  logTotal = 0;
  tenantRows = [];
  actorRows = [];
  for (const arr of Object.values(calls)) arr.length = 0;
});

describe('listAuditLog — filtering and pagination', () => {
  it('builds an empty where clause and computed pagination when no filters are given', async () => {
    await listAuditLog(baseQuery({ page: 2, pageSize: 10 }));

    assert.deepEqual((calls.findMany[0] as { where: unknown }).where, {});
    assert.deepEqual((calls.findMany[0] as { skip: number; take: number }).skip, 10);
    assert.deepEqual((calls.findMany[0] as { skip: number; take: number }).take, 10);
    assert.deepEqual((calls.findMany[0] as { orderBy: unknown }).orderBy, { at: 'desc' });
    assert.deepEqual(calls.count[0], { where: {} });
  });

  it('filters by action, entity, and tenantId when all three are provided', async () => {
    await listAuditLog(baseQuery({ action: 'suspend', entity: 'Tenant', tenantId: 't1' }));

    assert.deepEqual((calls.findMany[0] as { where: unknown }).where, {
      action: 'suspend',
      entity: 'Tenant',
      tenantId: 't1',
    });
  });

  it('adds a search OR clause across entity, entityId, and tenant name', async () => {
    await listAuditLog(baseQuery({ search: 'acme' }));

    assert.deepEqual((calls.findMany[0] as { where: unknown }).where, {
      OR: [
        { entity: { contains: 'acme', mode: 'insensitive' } },
        { entityId: { contains: 'acme', mode: 'insensitive' } },
        { tenant: { name: { contains: 'acme', mode: 'insensitive' } } },
      ],
    });
  });

  it('combines filters and search in the same where clause', async () => {
    await listAuditLog(baseQuery({ action: 'accept', search: 'x' }));

    assert.deepEqual((calls.findMany[0] as { where: unknown }).where, {
      action: 'accept',
      OR: [
        { entity: { contains: 'x', mode: 'insensitive' } },
        { entityId: { contains: 'x', mode: 'insensitive' } },
        { tenant: { name: { contains: 'x', mode: 'insensitive' } } },
      ],
    });
  });
});

describe('listAuditLog — actor/tenant name resolution', () => {
  it('resolves tenant and actor names for rows that have both', async () => {
    logRows = [logRow({ id: 'a1', tenantId: 't1', actorId: 'u1' })];
    logTotal = 1;
    tenantRows = [{ id: 't1', name: 'Acme' }];
    actorRows = [{ id: 'u1', name: 'Alice' }];

    const res = await listAuditLog(baseQuery());

    assert.deepEqual((calls.tenantFindMany[0] as { where: { id: { in: string[] } } }).where, { id: { in: ['t1'] } });
    assert.deepEqual((calls.userFindMany[0] as { where: { id: { in: string[] } } }).where, { id: { in: ['u1'] } });
    assert.equal(res.rows[0].tenant, 'Acme');
    assert.equal(res.rows[0].actor, 'Alice');
  });

  it('maps null tenantId/actorId rows (platform-level events) to null names without querying for them', async () => {
    logRows = [logRow({ id: 'a1', tenantId: null, actorId: null })];
    logTotal = 1;

    const res = await listAuditLog(baseQuery());

    assert.deepEqual((calls.tenantFindMany[0] as { where: { id: { in: string[] } } }).where, { id: { in: [] } });
    assert.deepEqual((calls.userFindMany[0] as { where: { id: { in: string[] } } }).where, { id: { in: [] } });
    assert.equal(res.rows[0].tenant, null);
    assert.equal(res.rows[0].actor, null);
  });

  it('falls back to null when the referenced tenant/actor id no longer resolves (deleted row)', async () => {
    logRows = [logRow({ id: 'a1', tenantId: 't-gone', actorId: 'u-gone' })];
    logTotal = 1;
    tenantRows = [];
    actorRows = [];

    const res = await listAuditLog(baseQuery());

    assert.equal(res.rows[0].tenant, null);
    assert.equal(res.rows[0].actor, null);
  });

  it('dedupes tenant/actor ids across multiple rows before querying', async () => {
    logRows = [
      logRow({ id: 'a1', tenantId: 't1', actorId: 'u1' }),
      logRow({ id: 'a2', tenantId: 't1', actorId: 'u1' }),
    ];
    logTotal = 2;

    await listAuditLog(baseQuery());

    assert.deepEqual((calls.tenantFindMany[0] as { where: { id: { in: string[] } } }).where, { id: { in: ['t1'] } });
    assert.deepEqual((calls.userFindMany[0] as { where: { id: { in: string[] } } }).where, { id: { in: ['u1'] } });
  });
});

describe('listAuditLog — response shape', () => {
  it('maps rows to AuditLogEntry DTOs including before/after and an ISO timestamp', async () => {
    logRows = [
      logRow({
        id: 'a1',
        before: { name: 'Old' },
        after: { name: 'New' },
        at: new Date('2026-03-15T12:30:00.000Z'),
      }),
    ];
    logTotal = 1;
    tenantRows = [{ id: 't1', name: 'Acme' }];
    actorRows = [{ id: 'u1', name: 'Alice' }];

    const res = await listAuditLog(baseQuery({ page: 1, pageSize: 20 }));

    assert.deepEqual(res.rows[0], {
      id: 'a1',
      at: '2026-03-15T12:30:00.000Z',
      actor: 'Alice',
      actorId: 'u1',
      tenant: 'Acme',
      tenantId: 't1',
      entity: 'User',
      entityId: 'e1',
      action: 'update',
      before: { name: 'Old' },
      after: { name: 'New' },
    });
    assert.equal(res.total, 1);
    assert.equal(res.page, 1);
    assert.equal(res.pageSize, 20);
  });
});
