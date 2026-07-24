import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import type { AuthedUser } from '../../middleware/auth.js';
import { globalSearch } from './search.service.js';

/**
 * Stubbed-Prisma suite (forms.service.test.ts pattern): PrismaClient exposes its delegates via a
 * proxy `get` trap, so `mock.method` can't see them — redefine every delegate the searchers read
 * as stubs backed by the mutable rows below, reset in `beforeEach`. Only `globalSearch` is
 * exported from the module (search.searchers.ts only exports the two dispatch arrays), so each
 * per-entity searcher (search.searchers.ts) is exercised through it, along with the
 * tenant-vs-System-Admin dispatch and empty-group filtering (search.service.ts) it performs.
 */

let requestRows: unknown[] = [];
let userRows: unknown[] = [];
let projectRows: unknown[] = [];
let departmentRows: unknown[] = [];
let tenantRows: unknown[] = [];
let registrationRows: unknown[] = [];

const calls = {
  requestFindMany: [] as unknown[],
  userFindMany: [] as unknown[],
  projectFindMany: [] as unknown[],
  departmentFindMany: [] as unknown[],
  tenantFindMany: [] as unknown[],
  enterpriseRegistrationFindMany: [] as unknown[],
};

Object.defineProperty(prisma, 'request', {
  value: {
    findMany: async (args: unknown) => {
      calls.requestFindMany.push(args);
      return requestRows;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: {
    findMany: async (args: unknown) => {
      calls.userFindMany.push(args);
      return userRows;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'project', {
  value: {
    findMany: async (args: unknown) => {
      calls.projectFindMany.push(args);
      return projectRows;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'department', {
  value: {
    findMany: async (args: unknown) => {
      calls.departmentFindMany.push(args);
      return departmentRows;
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
Object.defineProperty(prisma, 'enterpriseRegistration', {
  value: {
    findMany: async (args: unknown) => {
      calls.enterpriseRegistrationFindMany.push(args);
      return registrationRows;
    },
  },
  configurable: true,
});

function tenantViewer(overrides: Partial<AuthedUser> = {}): AuthedUser {
  return { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['employee'], ...overrides };
}

function systemAdminViewer(): AuthedUser {
  return { id: 'sa1', email: 'sa@b.c', isSystemAdmin: true, tenantId: null, roles: [] };
}

beforeEach(() => {
  requestRows = [];
  userRows = [];
  projectRows = [];
  departmentRows = [];
  tenantRows = [];
  registrationRows = [];
  for (const arr of Object.values(calls)) arr.length = 0;
});

describe('globalSearch — tenant viewer dispatch', () => {
  it('runs only the tenant searchers and never the System-Admin-only ones', async () => {
    await globalSearch(tenantViewer(), 'foo');

    assert.equal(calls.requestFindMany.length, 1);
    assert.equal(calls.userFindMany.length, 1);
    assert.equal(calls.projectFindMany.length, 1);
    assert.equal(calls.tenantFindMany.length, 0);
    assert.equal(calls.enterpriseRegistrationFindMany.length, 0);
  });

  it('scopes "My Requests" to the viewer as requester within their tenant, matching on form title', async () => {
    requestRows = [{ id: 'r1', status: 'pending', form: { title: 'Leave Request' } }];

    const res = await globalSearch(tenantViewer(), 'leave');

    assert.deepEqual(calls.requestFindMany[0], {
      where: {
        tenantId: 't1',
        requesterId: 'u1',
        form: { title: { contains: 'leave', mode: 'insensitive' } },
      },
      include: { form: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const group = res.groups.find((g) => g.type === 'request');
    assert.deepEqual(group?.items, [{ type: 'request', id: 'r1', title: 'Leave Request', subtitle: 'pending' }]);
  });

  it('scopes user search to Active users in the tenant, matching name or email', async () => {
    userRows = [{ id: 'u2', name: 'Bob', email: 'bob@example.com' }];

    const res = await globalSearch(tenantViewer(), 'bob');

    assert.deepEqual(calls.userFindMany[0], {
      where: {
        tenantId: 't1',
        status: 'Active',
        OR: [{ name: { contains: 'bob', mode: 'insensitive' } }, { email: { contains: 'bob', mode: 'insensitive' } }],
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: 5,
    });
    const group = res.groups.find((g) => g.type === 'user');
    assert.deepEqual(group?.items, [{ type: 'user', id: 'u2', title: 'Bob', subtitle: 'bob@example.com' }]);
  });

  it('scopes project search to active projects in the tenant', async () => {
    projectRows = [{ id: 'p1', name: 'Rollout' }];

    const res = await globalSearch(tenantViewer(), 'roll');

    assert.deepEqual(calls.projectFindMany[0], {
      where: { tenantId: 't1', status: 'active', name: { contains: 'roll', mode: 'insensitive' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 5,
    });
    const group = res.groups.find((g) => g.type === 'project');
    assert.deepEqual(group?.items, [{ type: 'project', id: 'p1', title: 'Rollout', subtitle: null }]);
  });

  it('omits departments entirely for a non-Enterprise-Admin viewer, without querying Prisma', async () => {
    departmentRows = [{ id: 'd1', name: 'Engineering' }];

    const res = await globalSearch(tenantViewer({ roles: ['employee'] }), 'eng');

    assert.equal(calls.departmentFindMany.length, 0);
    assert.equal(res.groups.some((g) => g.type === 'department'), false);
  });

  it('includes departments for an Enterprise Admin viewer, scoped to non-archived tenant rows', async () => {
    departmentRows = [{ id: 'd1', name: 'Engineering' }];

    const res = await globalSearch(tenantViewer({ roles: ['enterprise-admin'] }), 'eng');

    assert.deepEqual(calls.departmentFindMany[0], {
      where: { tenantId: 't1', archived: false, name: { contains: 'eng', mode: 'insensitive' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 5,
    });
    const group = res.groups.find((g) => g.type === 'department');
    assert.deepEqual(group?.items, [{ type: 'department', id: 'd1', title: 'Engineering', subtitle: null }]);
  });
});

describe('globalSearch — System Admin viewer dispatch', () => {
  it('runs only the System-Admin searchers and never the tenant-scoped ones', async () => {
    await globalSearch(systemAdminViewer(), 'foo');

    assert.equal(calls.tenantFindMany.length, 1);
    assert.equal(calls.enterpriseRegistrationFindMany.length, 1);
    assert.equal(calls.userFindMany.length, 1); // platform-user search, not the tenant one
    assert.equal(calls.requestFindMany.length, 0);
    assert.equal(calls.projectFindMany.length, 0);
    assert.equal(calls.departmentFindMany.length, 0);
  });

  it('scopes enterprise search to Active/Suspended tenants matching by name', async () => {
    tenantRows = [{ id: 't2', name: 'Acme', status: 'Active' }];

    const res = await globalSearch(systemAdminViewer(), 'acme');

    assert.deepEqual(calls.tenantFindMany[0], {
      where: { status: { in: ['Active', 'Suspended'] }, name: { contains: 'acme', mode: 'insensitive' } },
      select: { id: true, name: true, status: true },
      orderBy: { name: 'asc' },
      take: 5,
    });
    const group = res.groups.find((g) => g.type === 'enterprise');
    assert.deepEqual(group?.items, [{ type: 'enterprise', id: 't2', title: 'Acme', subtitle: 'Active' }]);
  });

  it('scopes registration search across company/contact name/contact email', async () => {
    registrationRows = [{ id: 'reg1', companyName: 'Acme Co', status: 'Pending' }];

    const res = await globalSearch(systemAdminViewer(), 'acme');

    assert.deepEqual(calls.enterpriseRegistrationFindMany[0], {
      where: {
        OR: [
          { companyName: { contains: 'acme', mode: 'insensitive' } },
          { contactName: { contains: 'acme', mode: 'insensitive' } },
          { contactEmail: { contains: 'acme', mode: 'insensitive' } },
        ],
      },
      select: { id: true, companyName: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const group = res.groups.find((g) => g.type === 'registration');
    assert.deepEqual(group?.items, [{ type: 'registration', id: 'reg1', title: 'Acme Co', subtitle: 'Pending' }]);
  });

  it('scopes platform-user search cross-tenant, surfacing the tenant name as subtitle', async () => {
    userRows = [{ id: 'u3', name: 'Carol', email: 'carol@example.com', tenant: { name: 'Acme' } }];

    const res = await globalSearch(systemAdminViewer(), 'carol');

    assert.deepEqual(calls.userFindMany[0], {
      where: {
        tenantId: { not: null },
        OR: [{ name: { contains: 'carol', mode: 'insensitive' } }, { email: { contains: 'carol', mode: 'insensitive' } }],
      },
      include: { tenant: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: 5,
    });
    const group = res.groups.find((g) => g.type === 'platform-user');
    assert.deepEqual(group?.items, [{ type: 'platform-user', id: 'u3', title: 'Carol', subtitle: 'Acme' }]);
  });

  it('falls back to a null subtitle for a platform user with no tenant relation', async () => {
    userRows = [{ id: 'u4', name: 'Dan', email: 'dan@example.com', tenant: null }];

    const res = await globalSearch(systemAdminViewer(), 'dan');

    const group = res.groups.find((g) => g.type === 'platform-user');
    assert.equal(group?.items[0].subtitle, null);
  });
});

describe('globalSearch — result aggregation', () => {
  it('filters out groups with no matches, returning only non-empty groups', async () => {
    requestRows = [];
    userRows = [{ id: 'u2', name: 'Bob', email: 'bob@example.com' }];
    projectRows = [];

    const res = await globalSearch(tenantViewer(), 'bob');

    assert.deepEqual(
      res.groups.map((g) => g.type),
      ['user'],
    );
  });

  it('returns an empty groups array when nothing matches anywhere', async () => {
    const res = await globalSearch(tenantViewer(), 'nomatch');
    assert.deepEqual(res.groups, []);
  });
});
