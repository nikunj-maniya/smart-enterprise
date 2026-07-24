import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SystemRoleKey } from '@se/shared';
import { prisma } from '../../prisma.js';
import type { AuthedUser } from '../../middleware/auth.js';
import { SYSTEM_ADMIN_SEARCHERS, TENANT_SEARCHERS } from './search.searchers.js';

/**
 * Stubbed-Prisma suite (departments.service.test.ts pattern): each searcher's own delegate is
 * redefined as an in-memory stub returning whatever the test sets, reset in `beforeEach`.
 * `TENANT_SEARCHERS`/`SYSTEM_ADMIN_SEARCHERS` are the only exports, so each searcher is exercised
 * by its fixed position in the array it's registered in (see search.searchers.ts's exports).
 */

let rows: unknown[] = [];

function stubFindMany(model: string) {
  Object.defineProperty(prisma, model, {
    value: { findMany: async () => rows },
    configurable: true,
  });
}

const TENANT_VIEWER: AuthedUser = {
  id: 'u1',
  email: 'a@b.c',
  isSystemAdmin: false,
  tenantId: 't1',
  roles: [],
};

beforeEach(() => {
  rows = [];
});

describe('TENANT_SEARCHERS / SYSTEM_ADMIN_SEARCHERS wiring', () => {
  it('registers exactly the 4 tenant-tier searchers and 3 system-admin-tier searchers', () => {
    assert.equal(TENANT_SEARCHERS.length, 4);
    assert.equal(SYSTEM_ADMIN_SEARCHERS.length, 3);
  });
});

describe('searchOwnRequests (TENANT_SEARCHERS[0])', () => {
  it('returns null when no requests match', async () => {
    stubFindMany('request');
    assert.equal(await TENANT_SEARCHERS[0](TENANT_VIEWER, 'q'), null);
  });

  it('maps matching rows into a "request" group with the form title and status', async () => {
    rows = [{ id: 'r1', status: 'Pending Approval', form: { title: 'Leave Request' } }];
    stubFindMany('request');
    const result = await TENANT_SEARCHERS[0](TENANT_VIEWER, 'q');
    assert.deepEqual(result, {
      type: 'request',
      label: 'My Requests',
      items: [{ type: 'request', id: 'r1', title: 'Leave Request', subtitle: 'Pending Approval' }],
    });
  });
});

describe('searchUsers (TENANT_SEARCHERS[1])', () => {
  it('returns null when no users match', async () => {
    stubFindMany('user');
    assert.equal(await TENANT_SEARCHERS[1](TENANT_VIEWER, 'q'), null);
  });

  it('maps matching rows into a "user" group with name/email', async () => {
    rows = [{ id: 'u2', name: 'Jane Doe', email: 'jane@b.c' }];
    stubFindMany('user');
    const result = await TENANT_SEARCHERS[1](TENANT_VIEWER, 'q');
    assert.deepEqual(result, {
      type: 'user',
      label: 'Users',
      items: [{ type: 'user', id: 'u2', title: 'Jane Doe', subtitle: 'jane@b.c' }],
    });
  });
});

describe('searchProjects (TENANT_SEARCHERS[2])', () => {
  it('returns null when no projects match', async () => {
    stubFindMany('project');
    assert.equal(await TENANT_SEARCHERS[2](TENANT_VIEWER, 'q'), null);
  });

  it('maps matching rows into a "project" group with a null subtitle', async () => {
    rows = [{ id: 'p1', name: 'Apollo' }];
    stubFindMany('project');
    const result = await TENANT_SEARCHERS[2](TENANT_VIEWER, 'q');
    assert.deepEqual(result, {
      type: 'project',
      label: 'Projects',
      items: [{ type: 'project', id: 'p1', title: 'Apollo', subtitle: null }],
    });
  });
});

describe('searchDepartments (TENANT_SEARCHERS[3])', () => {
  it('returns null for a viewer without the Enterprise Admin role, before touching Prisma', async () => {
    assert.equal(await TENANT_SEARCHERS[3](TENANT_VIEWER, 'q'), null);
  });

  it('maps matching rows into a "department" group for an Enterprise Admin viewer', async () => {
    rows = [{ id: 'd1', name: 'Engineering' }];
    stubFindMany('department');
    const admin: AuthedUser = { ...TENANT_VIEWER, roles: [SystemRoleKey.EnterpriseAdmin] };
    const result = await TENANT_SEARCHERS[3](admin, 'q');
    assert.deepEqual(result, {
      type: 'department',
      label: 'Departments',
      items: [{ type: 'department', id: 'd1', title: 'Engineering', subtitle: null }],
    });
  });
});

const SYSTEM_ADMIN_VIEWER: AuthedUser = { id: 'sa1', email: 'sa@b.c', isSystemAdmin: true, tenantId: null, roles: [] };

describe('searchEnterprises (SYSTEM_ADMIN_SEARCHERS[0])', () => {
  it('returns null when no enterprises match', async () => {
    stubFindMany('tenant');
    assert.equal(await SYSTEM_ADMIN_SEARCHERS[0](SYSTEM_ADMIN_VIEWER, 'q'), null);
  });

  it('maps matching rows into an "enterprise" group with the tenant status', async () => {
    rows = [{ id: 't1', name: 'Acme', status: 'Active' }];
    stubFindMany('tenant');
    const result = await SYSTEM_ADMIN_SEARCHERS[0](SYSTEM_ADMIN_VIEWER, 'q');
    assert.deepEqual(result, {
      type: 'enterprise',
      label: 'Enterprises',
      items: [{ type: 'enterprise', id: 't1', title: 'Acme', subtitle: 'Active' }],
    });
  });
});

describe('searchRegistrations (SYSTEM_ADMIN_SEARCHERS[1])', () => {
  it('returns null when no registrations match', async () => {
    stubFindMany('enterpriseRegistration');
    assert.equal(await SYSTEM_ADMIN_SEARCHERS[1](SYSTEM_ADMIN_VIEWER, 'q'), null);
  });

  it('maps matching rows into a "registration" group with the company name and status', async () => {
    rows = [{ id: 'er1', companyName: 'Acme Inc', status: 'Pending' }];
    stubFindMany('enterpriseRegistration');
    const result = await SYSTEM_ADMIN_SEARCHERS[1](SYSTEM_ADMIN_VIEWER, 'q');
    assert.deepEqual(result, {
      type: 'registration',
      label: 'Registrations',
      items: [{ type: 'registration', id: 'er1', title: 'Acme Inc', subtitle: 'Pending' }],
    });
  });
});

describe('searchPlatformUsers (SYSTEM_ADMIN_SEARCHERS[2])', () => {
  it('returns null when no platform users match', async () => {
    stubFindMany('user');
    assert.equal(await SYSTEM_ADMIN_SEARCHERS[2](SYSTEM_ADMIN_VIEWER, 'q'), null);
  });

  it('maps matching rows into a "platform-user" group with the tenant name as subtitle', async () => {
    rows = [{ id: 'u3', name: 'Bob', email: 'bob@b.c', tenant: { name: 'Acme' } }];
    stubFindMany('user');
    const result = await SYSTEM_ADMIN_SEARCHERS[2](SYSTEM_ADMIN_VIEWER, 'q');
    assert.deepEqual(result, {
      type: 'platform-user',
      label: 'Platform Users',
      items: [{ type: 'platform-user', id: 'u3', title: 'Bob', subtitle: 'Acme' }],
    });
  });

  it('falls back to a null subtitle when the platform user has no tenant', async () => {
    rows = [{ id: 'u4', name: 'Nobody', email: 'nobody@b.c', tenant: null }];
    stubFindMany('user');
    const result = await SYSTEM_ADMIN_SEARCHERS[2](SYSTEM_ADMIN_VIEWER, 'q');
    assert.equal(result!.items[0].subtitle, null);
  });
});
