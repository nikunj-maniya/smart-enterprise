import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { adminResetPassword, listPlatformUsers } from './users.service.js';

/**
 * PrismaClient exposes its delegates via a proxy `get` trap, so `mock.method` can't see them —
 * redefine the delegates this service reads/writes as stubs backed by the mutable rows below
 * (forms.service.test.ts pattern). `$transaction`'s array form just awaits the already-created
 * promises; its callback form (unused here) would receive `prisma` itself as the tx client,
 * which works because every delegate it could touch is stubbed on the same singleton.
 */

type UserRow = {
  id: string;
  name: string;
  email: string;
  isSystemAdmin: boolean;
  tenantId: string | null;
  status: string;
  createdAt: Date;
  tenant: { name: string } | null;
  roles: { role: { name: string } }[];
};

let userRows: UserRow[] = [];
let userCount = 0;
let findUniqueResult: (UserRow & { passwordHash: string }) | null = null;
const calls = {
  findMany: [] as unknown[],
  count: [] as unknown[],
  update: [] as unknown[],
  auditCreate: [] as unknown[],
};

Object.defineProperty(prisma, 'user', {
  value: {
    findMany: async (args: unknown) => {
      calls.findMany.push(args);
      return userRows;
    },
    count: async (args: unknown) => {
      calls.count.push(args);
      return userCount;
    },
    findUnique: async () => findUniqueResult,
    update: async (args: { where: { id: string }; data: unknown }) => {
      calls.update.push(args);
      return { ...findUniqueResult, ...(args.data as object) };
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'auditLog', {
  value: {
    create: async (args: unknown) => {
      calls.auditCreate.push(args);
      return args;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma)),
  configurable: true,
});

function row(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u1',
    name: 'Asha Patel',
    email: 'asha@acme.com',
    isSystemAdmin: false,
    tenantId: 't1',
    status: 'Active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    tenant: { name: 'Acme Inc' },
    roles: [],
    ...overrides,
  };
}

describe('listPlatformUsers', () => {
  beforeEach(() => {
    userRows = [];
    userCount = 0;
    calls.findMany.length = 0;
    calls.count.length = 0;
  });

  it('excludes the platform System Admin (tenantId null) by default', async () => {
    await listPlatformUsers({ page: 1, pageSize: 20 });
    const args = calls.findMany[0] as { where: { tenantId: unknown } };
    assert.deepEqual(args.where.tenantId, { not: null });
  });

  it('scopes to a specific tenant when tenantId is given, overriding the not-null filter', async () => {
    await listPlatformUsers({ page: 1, pageSize: 20, tenantId: 't1' });
    const args = calls.findMany[0] as { where: { tenantId: unknown } };
    assert.equal(args.where.tenantId, 't1');
  });

  it('applies the status filter and a case-insensitive name/email search', async () => {
    await listPlatformUsers({ page: 1, pageSize: 20, status: 'Active', search: 'asha' });
    const args = calls.findMany[0] as { where: { status: unknown; OR: unknown[] } };
    assert.equal(args.where.status, 'Active');
    assert.deepEqual(args.where.OR, [
      { name: { contains: 'asha', mode: 'insensitive' } },
      { email: { contains: 'asha', mode: 'insensitive' } },
    ]);
  });

  it('paginates with skip/take derived from page and pageSize', async () => {
    await listPlatformUsers({ page: 3, pageSize: 10 });
    const args = calls.findMany[0] as { skip: number; take: number };
    assert.equal(args.skip, 20);
    assert.equal(args.take, 10);
  });

  it('maps a System Admin row to the "System Admin" role label', async () => {
    userRows = [row({ isSystemAdmin: true, roles: [] })];
    userCount = 1;
    const res = await listPlatformUsers({ page: 1, pageSize: 20 });
    assert.equal(res.rows[0].role, 'System Admin');
  });

  it('joins and sorts multiple role names for a non-admin row', async () => {
    userRows = [row({ roles: [{ role: { name: 'Tech Lead' } }, { role: { name: 'Employee' } }] })];
    userCount = 1;
    const res = await listPlatformUsers({ page: 1, pageSize: 20 });
    assert.equal(res.rows[0].role, 'Employee, Tech Lead');
  });

  it('falls back to "No role" when a tenant user holds no roles', async () => {
    userRows = [row({ roles: [] })];
    userCount = 1;
    const res = await listPlatformUsers({ page: 1, pageSize: 20 });
    assert.equal(res.rows[0].role, 'No role');
  });

  it('reads enterpriseName from the included tenant', async () => {
    userRows = [row({ tenant: { name: 'Acme Inc' } })];
    userCount = 1;
    const res = await listPlatformUsers({ page: 1, pageSize: 20 });
    assert.equal(res.rows[0].enterpriseName, 'Acme Inc');
  });
});

describe('adminResetPassword', () => {
  beforeEach(() => {
    findUniqueResult = null;
    calls.update.length = 0;
    calls.auditCreate.length = 0;
  });

  it('throws 404 when the user does not exist', async () => {
    await assert.rejects(
      () => adminResetPassword('missing', 'actor1'),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 404);
        assert.equal((err as Error).message, 'User not found');
        return true;
      },
    );
  });

  it('throws 400 when targeting a System Admin account', async () => {
    findUniqueResult = { ...row({ isSystemAdmin: true }), passwordHash: 'x' };
    await assert.rejects(
      () => adminResetPassword('u1', 'actor1'),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 400);
        assert.equal((err as Error).message, 'Cannot reset a System Admin account this way');
        return true;
      },
    );
  });

  it('issues a temporary password, forces a password change, and audits the reset', async () => {
    findUniqueResult = { ...row({ id: 'u1', tenantId: 't1' }), passwordHash: 'old-hash' };
    const res = await adminResetPassword('u1', 'actor1');

    assert.equal(typeof res.temporaryPassword, 'string');
    assert.ok(res.temporaryPassword.length > 0);

    const updateArgs = calls.update[0] as { where: { id: string }; data: { mustChangePassword: boolean } };
    assert.equal(updateArgs.where.id, 'u1');
    assert.equal(updateArgs.data.mustChangePassword, true);

    const auditArgs = calls.auditCreate[0] as { data: { tenantId: string | null; actorId: string; entity: string; action: string } };
    assert.deepEqual(auditArgs.data, {
      tenantId: 't1',
      actorId: 'actor1',
      entity: 'User',
      entityId: 'u1',
      action: 'password_reset',
    });
  });
});
