import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TenantStatus } from '@prisma/client';
import { AuditAction, RegistrationStatus } from '@se/shared';
import { prisma } from '../../prisma.js';
import { getOverview } from './overview.service.js';

/**
 * Prisma delegate stubs (forms.service.test.ts pattern: PrismaClient's proxy `get` trap defeats
 * `mock.method`, so the six delegates this aggregation reads are redefined directly). No live DB
 * in CI.
 */
type TenantRow = { id: string; name: string };
type UserRow = { id: string; name: string };
type RegistrationRow = { id: string; companyName: string; contactName: string; status: string; createdAt: Date };
type AuditRow = { id: string; tenantId: string | null; actorId: string | null; entity: string; entityId: string; action: string; at: Date };

let counts = { pending: 0, active: 0, suspended: 0, users: 0 };
let registrationRows: RegistrationRow[] = [];
let auditRows: AuditRow[] = [];
let tenantRows: TenantRow[] = [];
let userRows: UserRow[] = [];
const calls = { auditFindMany: undefined as unknown, tenantFindMany: undefined as unknown, userFindMany: undefined as unknown };

Object.defineProperty(prisma, 'tenant', {
  value: {
    count: async (args: { where: { status: TenantStatus } }) => {
      if (args.where.status === TenantStatus.Pending) return counts.pending;
      if (args.where.status === TenantStatus.Active) return counts.active;
      if (args.where.status === TenantStatus.Suspended) return counts.suspended;
      return 0;
    },
    findMany: async (args: unknown) => {
      calls.tenantFindMany = args;
      return tenantRows;
    },
  },
  configurable: true,
});

Object.defineProperty(prisma, 'user', {
  value: {
    count: async () => counts.users,
    findMany: async (args: unknown) => {
      calls.userFindMany = args;
      return userRows;
    },
  },
  configurable: true,
});

Object.defineProperty(prisma, 'enterpriseRegistration', {
  value: {
    findMany: async () => registrationRows,
  },
  configurable: true,
});

Object.defineProperty(prisma, 'auditLog', {
  value: {
    findMany: async (args: unknown) => {
      calls.auditFindMany = args;
      return auditRows;
    },
  },
  configurable: true,
});

function registration(overrides: Partial<RegistrationRow> = {}): RegistrationRow {
  return {
    id: 'r1',
    companyName: 'Acme Corp',
    contactName: 'Jane Doe',
    status: RegistrationStatus.Pending,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  counts = { pending: 0, active: 0, suspended: 0, users: 0 };
  registrationRows = [];
  auditRows = [];
  tenantRows = [];
  userRows = [];
  calls.auditFindMany = undefined;
  calls.tenantFindMany = undefined;
  calls.userFindMany = undefined;
});

describe('getOverview counts', () => {
  it('reports the four tenant/user counts from the count queries', async () => {
    counts = { pending: 2, active: 5, suspended: 1, users: 40 };

    const result = await getOverview();

    assert.deepEqual(result.counts, { pending: 2, active: 5, users: 40, suspended: 1 });
  });
});

describe('getOverview latestRegistrations', () => {
  it('surfaces Pending registrations before others regardless of recency (stable within each group)', async () => {
    registrationRows = [
      registration({ id: 'old-accepted', status: RegistrationStatus.Accepted, createdAt: new Date('2026-01-05') }),
      registration({ id: 'pending-1', status: RegistrationStatus.Pending, createdAt: new Date('2026-01-01') }),
      registration({ id: 'new-accepted', status: RegistrationStatus.Accepted, createdAt: new Date('2026-01-10') }),
      registration({ id: 'pending-2', status: RegistrationStatus.Pending, createdAt: new Date('2026-01-03') }),
    ];

    const result = await getOverview();

    assert.deepEqual(
      result.latestRegistrations.map((r) => r.id),
      ['pending-1', 'pending-2', 'old-accepted', 'new-accepted'],
    );
  });

  it('caps the response at 4 registrations even with a larger pool', async () => {
    registrationRows = Array.from({ length: 10 }, (_, i) => registration({ id: `r${i}` }));

    const result = await getOverview();

    assert.equal(result.latestRegistrations.length, 4);
  });

  it('maps registration fields to the DTO shape', async () => {
    registrationRows = [registration()];

    const result = await getOverview();

    assert.deepEqual(result.latestRegistrations[0], {
      id: 'r1',
      companyName: 'Acme Corp',
      contactName: 'Jane Doe',
      status: RegistrationStatus.Pending,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('getOverview recentActivity', () => {
  it('resolves the actor name and tenant (target) name from the audit row ids', async () => {
    auditRows = [
      {
        id: 'a1',
        tenantId: 't1',
        actorId: 'u1',
        entity: 'Tenant',
        entityId: 't1',
        action: AuditAction.Suspend,
        at: new Date('2026-01-02T00:00:00.000Z'),
      },
    ];
    tenantRows = [{ id: 't1', name: 'Acme Corp' }];
    userRows = [{ id: 'u1', name: 'Jane Doe' }];

    const result = await getOverview();

    assert.deepEqual(result.recentActivity, [
      { id: 'a1', actor: 'Jane Doe', action: AuditAction.Suspend, target: 'Acme Corp', at: '2026-01-02T00:00:00.000Z' },
    ]);
  });

  it("falls back to 'System' actor and 'Unknown' target when ids don't resolve", async () => {
    auditRows = [
      {
        id: 'a1',
        tenantId: null,
        actorId: null,
        entity: 'Tenant',
        entityId: 'deleted-tenant',
        action: AuditAction.Reactivate,
        at: new Date('2026-01-02T00:00:00.000Z'),
      },
    ];

    const result = await getOverview();

    assert.deepEqual(result.recentActivity[0], {
      id: 'a1',
      actor: 'System',
      action: AuditAction.Reactivate,
      target: 'Unknown',
      at: '2026-01-02T00:00:00.000Z',
    });
  });

  it('only looks up tenants for Tenant-entity rows, deduplicating ids', async () => {
    auditRows = [
      { id: 'a1', tenantId: 't1', actorId: 'u1', entity: 'Tenant', entityId: 't1', action: AuditAction.Accept, at: new Date() },
      { id: 'a2', tenantId: 't1', actorId: 'u1', entity: 'Tenant', entityId: 't1', action: AuditAction.Reject, at: new Date() },
      { id: 'a3', tenantId: null, actorId: 'u1', entity: 'Other', entityId: 'x1', action: AuditAction.Accept, at: new Date() },
    ];
    tenantRows = [{ id: 't1', name: 'Acme Corp' }];
    userRows = [{ id: 'u1', name: 'Jane Doe' }];

    await getOverview();

    const args = calls.tenantFindMany as { where: { id: { in: string[] } } };
    assert.deepEqual(args.where.id.in, ['t1']);
  });
});
