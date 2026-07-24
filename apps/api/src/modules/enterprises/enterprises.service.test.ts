import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TenantStatus } from '@prisma/client';
import { AuditAction } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { listEnterprises, reactivateEnterprise, suspendEnterprise } from './enterprises.service.js';

/**
 * Prisma delegate stubs (forms.service.test.ts pattern: PrismaClient's proxy `get` trap defeats
 * `mock.method`, so the delegates + `$transaction` this service reads/writes are redefined
 * directly). No live DB in CI.
 */
type TenantRow = {
  id: string;
  name: string;
  industry: string | null;
  status: TenantStatus;
  createdAt: Date;
  _count: { users: number };
};

let tenantRows: TenantRow[] = [];
let tenantCount = 0;
let tenantById = new Map<string, TenantRow>();
const calls = {
  findMany: [] as unknown[],
  count: [] as unknown[],
  update: [] as unknown[],
  auditCreate: [] as unknown[],
};

Object.defineProperty(prisma, 'tenant', {
  value: {
    findMany: async (args: unknown) => {
      calls.findMany.push(args);
      return tenantRows;
    },
    count: async (args: unknown) => {
      calls.count.push(args);
      return tenantCount;
    },
    findUnique: async (args: { where: { id: string } }) => tenantById.get(args.where.id) ?? null,
  },
  configurable: true,
});

Object.defineProperty(prisma, '$transaction', {
  value: async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      tenant: {
        update: async (args: { where: { id: string }; data: { status: TenantStatus } }) => {
          calls.update.push(args);
          const existing = tenantById.get(args.where.id)!;
          const updated = { ...existing, status: args.data.status };
          tenantById.set(args.where.id, updated);
          return updated;
        },
      },
      auditLog: {
        create: async (args: unknown) => {
          calls.auditCreate.push(args);
          return args;
        },
      },
    }),
  configurable: true,
});

function tenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: 't1',
    name: 'Acme Corp',
    industry: 'Manufacturing',
    status: TenantStatus.Active,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    _count: { users: 3 },
    ...overrides,
  };
}

beforeEach(() => {
  tenantRows = [];
  tenantCount = 0;
  tenantById = new Map();
  calls.findMany.length = 0;
  calls.count.length = 0;
  calls.update.length = 0;
  calls.auditCreate.length = 0;
});

describe('listEnterprises', () => {
  it('maps tenant rows to EnterpriseDto shape and passes through pagination', async () => {
    tenantRows = [tenant()];
    tenantCount = 1;

    const result = await listEnterprises({ page: 1, pageSize: 20 });

    assert.deepEqual(result, {
      rows: [
        {
          id: 't1',
          name: 'Acme Corp',
          industry: 'Manufacturing',
          users: 3,
          since: '2026-01-01T00:00:00.000Z',
          status: TenantStatus.Active,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('scopes to Active/Suspended tenants by default (Pending/Rejected excluded)', async () => {
    await listEnterprises({ page: 1, pageSize: 20 });

    const args = calls.findMany[0] as { where: { status: { in: TenantStatus[] } } };
    assert.deepEqual(args.where.status, { in: [TenantStatus.Active, TenantStatus.Suspended] });
  });

  it('narrows to a single status when one is given', async () => {
    await listEnterprises({ page: 1, pageSize: 20, status: TenantStatus.Suspended as never });

    const args = calls.findMany[0] as { where: { status: unknown } };
    assert.equal(args.where.status, TenantStatus.Suspended);
  });

  it('applies a case-insensitive name/industry search filter', async () => {
    await listEnterprises({ page: 1, pageSize: 20, search: 'acme' });

    const args = calls.findMany[0] as { where: { OR: unknown[] } };
    assert.deepEqual(args.where.OR, [
      { name: { contains: 'acme', mode: 'insensitive' } },
      { industry: { contains: 'acme', mode: 'insensitive' } },
    ]);
  });

  it('paginates with skip/take derived from page/pageSize', async () => {
    await listEnterprises({ page: 3, pageSize: 10 });

    const args = calls.findMany[0] as { skip: number; take: number };
    assert.equal(args.skip, 20);
    assert.equal(args.take, 10);
  });
});

describe('suspendEnterprise', () => {
  it('throws 404 when the tenant does not exist', async () => {
    await assert.rejects(suspendEnterprise('missing', 'actor-1'), (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 404);
      assert.equal(err.message, 'Enterprise not found');
      return true;
    });
  });

  it('throws 409 when the tenant is not currently Active', async () => {
    tenantById.set('t1', tenant({ status: TenantStatus.Suspended }));

    await assert.rejects(suspendEnterprise('t1', 'actor-1'), (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 409);
      assert.equal(err.message, 'Only an active enterprise can be suspended');
      return true;
    });
  });

  it('transitions Active -> Suspended and records an audit log entry', async () => {
    tenantById.set('t1', tenant({ status: TenantStatus.Active }));

    await suspendEnterprise('t1', 'actor-1');

    assert.equal(tenantById.get('t1')?.status, TenantStatus.Suspended);
    assert.equal(calls.auditCreate.length, 1);
    const { data } = calls.auditCreate[0] as { data: Record<string, unknown> };
    assert.equal(data.tenantId, 't1');
    assert.equal(data.actorId, 'actor-1');
    assert.equal(data.entity, 'Tenant');
    assert.equal(data.action, AuditAction.Suspend);
    assert.deepEqual(data.before, { status: TenantStatus.Active });
    assert.deepEqual(data.after, { status: TenantStatus.Suspended });
  });
});

describe('reactivateEnterprise', () => {
  it('throws 404 when the tenant does not exist', async () => {
    await assert.rejects(reactivateEnterprise('missing', 'actor-1'), (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 404);
      assert.equal(err.message, 'Enterprise not found');
      return true;
    });
  });

  it('throws 409 when the tenant is not currently Suspended', async () => {
    tenantById.set('t1', tenant({ status: TenantStatus.Active }));

    await assert.rejects(reactivateEnterprise('t1', 'actor-1'), (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 409);
      assert.equal(err.message, 'Only a suspended enterprise can be reactivated');
      return true;
    });
  });

  it('transitions Suspended -> Active and records an audit log entry', async () => {
    tenantById.set('t1', tenant({ status: TenantStatus.Suspended }));

    await reactivateEnterprise('t1', 'actor-1');

    assert.equal(tenantById.get('t1')?.status, TenantStatus.Active);
    assert.equal(calls.auditCreate.length, 1);
    const { data } = calls.auditCreate[0] as { data: Record<string, unknown> };
    assert.equal(data.action, AuditAction.Reactivate);
    assert.deepEqual(data.before, { status: TenantStatus.Suspended });
    assert.deepEqual(data.after, { status: TenantStatus.Active });
  });
});
