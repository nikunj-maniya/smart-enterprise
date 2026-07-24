import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { createRole, deleteRole, listRoles, setRoleArchived, updateRole } from './roles.service.js';

/**
 * PrismaClient exposes its delegates via a proxy `get` trap, so `mock.method` can't see them —
 * redefine the `role` and `auditLog` delegates this service reads/writes as stubs backed by the
 * mutable rows below (forms.service.test.ts pattern). `$transaction`'s callback form receives
 * `prisma` itself as the tx client, which works because every delegate it could touch is stubbed
 * on the same singleton.
 */

type RoleRow = {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
  archived: boolean;
  _count: { users: number };
};

let roleRows: RoleRow[] = [];
let roleCount = 0;
let findUniqueRole: RoleRow | null = null;
let findFirstClash: RoleRow | null = null;

const calls = {
  findMany: [] as unknown[],
  create: [] as unknown[],
  update: [] as unknown[],
  delete: [] as unknown[],
  findFirst: [] as unknown[],
  auditCreate: [] as unknown[],
};

Object.defineProperty(prisma, 'role', {
  value: {
    findMany: async (args: unknown) => {
      calls.findMany.push(args);
      return roleRows;
    },
    count: async () => roleCount,
    findFirst: async (args: unknown) => {
      calls.findFirst.push(args);
      return findFirstClash;
    },
    findUnique: async () => findUniqueRole,
    create: async (args: { data: { name: string; key: string; permissions: string[] } }) => {
      calls.create.push(args);
      return {
        id: 'new-role',
        tenantId: 't1',
        key: args.data.key,
        name: args.data.name,
        isSystem: false,
        permissions: args.data.permissions,
        archived: false,
        _count: { users: 0 },
      };
    },
    update: async (args: { where: { id: string }; data: Partial<RoleRow> }) => {
      calls.update.push(args);
      return { ...(findUniqueRole as RoleRow), ...args.data };
    },
    delete: async (args: unknown) => {
      calls.delete.push(args);
      return findUniqueRole;
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

function resetAll() {
  roleRows = [];
  roleCount = 0;
  findUniqueRole = null;
  findFirstClash = null;
  for (const key of Object.keys(calls) as (keyof typeof calls)[]) calls[key].length = 0;
}

function role(overrides: Partial<RoleRow> = {}): RoleRow {
  return {
    id: 'r1',
    tenantId: 't1',
    key: 'employee',
    name: 'Employee',
    isSystem: false,
    permissions: ['view_all_forms'],
    archived: false,
    _count: { users: 0 },
    ...overrides,
  };
}

describe('listRoles', () => {
  beforeEach(resetAll);

  it('scopes the query to the tenant', async () => {
    await listRoles('t1', { page: 1, pageSize: 20 });
    const args = calls.findMany[0] as { where: { tenantId: string } };
    assert.equal(args.where.tenantId, 't1');
  });

  it('maps type=system to isSystem:true and type=custom to isSystem:false', async () => {
    await listRoles('t1', { page: 1, pageSize: 20, type: 'system' });
    assert.equal((calls.findMany[0] as { where: { isSystem: boolean } }).where.isSystem, true);

    await listRoles('t1', { page: 1, pageSize: 20, type: 'custom' });
    assert.equal((calls.findMany[1] as { where: { isSystem: boolean } }).where.isSystem, false);
  });

  it('applies the archived filter only when explicitly set', async () => {
    await listRoles('t1', { page: 1, pageSize: 20 });
    assert.equal('archived' in (calls.findMany[0] as { where: object }).where, false);

    await listRoles('t1', { page: 1, pageSize: 20, archived: true });
    assert.equal((calls.findMany[1] as { where: { archived: boolean } }).where.archived, true);
  });

  it('applies a case-insensitive name search', async () => {
    await listRoles('t1', { page: 1, pageSize: 20, search: 'lead' });
    assert.deepEqual((calls.findMany[0] as { where: { name: unknown } }).where.name, {
      contains: 'lead',
      mode: 'insensitive',
    });
  });

  it('paginates and maps memberCount from _count.users', async () => {
    roleRows = [role({ _count: { users: 5 } })];
    roleCount = 1;
    const res = await listRoles('t1', { page: 2, pageSize: 10 });
    assert.equal(res.rows[0].memberCount, 5);
    const args = calls.findMany[0] as { skip: number; take: number };
    assert.equal(args.skip, 10);
    assert.equal(args.take, 10);
  });
});

describe('createRole', () => {
  beforeEach(resetAll);

  it('throws 409 when a role with this name already exists (case-insensitive)', async () => {
    findFirstClash = role({ name: 'Employee' });
    await assert.rejects(
      () => createRole('t1', 'actor1', { name: 'employee', permissions: [] }),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 409);
        assert.equal((err as Error).message, 'A role with this name already exists');
        return true;
      },
    );
  });

  it('creates a custom role with a generated custom- key and audits the creation', async () => {
    const dto = await createRole('t1', 'actor1', { name: 'New Role', permissions: ['view_all_forms'] });
    assert.equal(dto.name, 'New Role');
    assert.equal(dto.isSystem, false);
    const createArgs = calls.create[0] as { data: { key: string; isSystem: boolean } };
    assert.ok(createArgs.data.key.startsWith('custom-'));
    assert.equal(createArgs.data.isSystem, false);
    const audit = calls.auditCreate[0] as { data: { action: string; entity: string } };
    assert.equal(audit.data.action, 'create');
    assert.equal(audit.data.entity, 'Role');
  });
});

describe('updateRole', () => {
  beforeEach(resetAll);

  it('throws 404 when the role does not exist in this tenant', async () => {
    findUniqueRole = null;
    await assert.rejects(
      () => updateRole('t1', 'missing', 'actor1', { name: 'X', permissions: [] }),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 404);
        return true;
      },
    );
  });

  it('throws 404 when the role belongs to a different tenant', async () => {
    findUniqueRole = role({ tenantId: 'other-tenant' });
    await assert.rejects(
      () => updateRole('t1', 'r1', 'actor1', { name: 'X', permissions: [] }),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 404);
        return true;
      },
    );
  });

  it('throws 409 on a duplicate name held by a different role', async () => {
    findUniqueRole = role();
    findFirstClash = role({ id: 'other-role', name: 'Clash' });
    await assert.rejects(
      () => updateRole('t1', 'r1', 'actor1', { name: 'Clash', permissions: [] }),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 409);
        return true;
      },
    );
  });

  it('allows keeping its own current name (excepts itself from the clash check)', async () => {
    findUniqueRole = role({ name: 'Employee' });
    findFirstClash = null;
    const dto = await updateRole('t1', 'r1', 'actor1', { name: 'Employee', permissions: ['view_all_forms'] });
    assert.equal(dto.name, 'Employee');
    const clashArgs = calls.findFirst[0] as { where: { id: { not: string } } };
    assert.equal(clashArgs.where.id.not, 'r1');
  });

  it('ignores incoming permission changes for a System role, keeping the seeded set', async () => {
    findUniqueRole = role({ isSystem: true, permissions: ['view_all_forms', 'submit_request'] });
    const dto = await updateRole('t1', 'r1', 'actor1', { name: 'Employee', permissions: ['manage_org'] });
    assert.deepEqual(dto.permissions, ['view_all_forms', 'submit_request']);
  });

  it('applies incoming permission changes for a custom role', async () => {
    findUniqueRole = role({ isSystem: false, permissions: ['view_all_forms'] });
    const dto = await updateRole('t1', 'r1', 'actor1', { name: 'Custom', permissions: ['manage_org'] });
    assert.deepEqual(dto.permissions, ['manage_org']);
  });
});

describe('setRoleArchived', () => {
  beforeEach(resetAll);

  it('throws 404 when the role does not exist in this tenant', async () => {
    findUniqueRole = null;
    await assert.rejects(() => setRoleArchived('t1', 'r1', 'actor1', true), (err: unknown) => {
      assert.equal((err as { status: number }).status, 404);
      return true;
    });
  });

  it('throws 409 when archiving a System role', async () => {
    findUniqueRole = role({ isSystem: true });
    await assert.rejects(() => setRoleArchived('t1', 'r1', 'actor1', true), (err: unknown) => {
      assert.equal((err as { status: number }).status, 409);
      assert.equal((err as Error).message, 'System roles cannot be archived');
      return true;
    });
  });

  it('archives a custom role and audits before/after with action "archive"', async () => {
    findUniqueRole = role({ isSystem: false, archived: false });
    const dto = await setRoleArchived('t1', 'r1', 'actor1', true);
    assert.equal(dto.archived, true);
    const audit = calls.auditCreate[0] as { data: { action: string; before: { archived: boolean }; after: { archived: boolean } } };
    assert.equal(audit.data.action, 'archive');
    assert.equal(audit.data.before.archived, false);
    assert.equal(audit.data.after.archived, true);
  });

  it('unarchives with action "unarchive"', async () => {
    findUniqueRole = role({ isSystem: false, archived: true });
    const dto = await setRoleArchived('t1', 'r1', 'actor1', false);
    assert.equal(dto.archived, false);
    const audit = calls.auditCreate[0] as { data: { action: string } };
    assert.equal(audit.data.action, 'unarchive');
  });
});

describe('deleteRole', () => {
  beforeEach(resetAll);

  it('throws 404 when the role does not exist in this tenant', async () => {
    findUniqueRole = null;
    await assert.rejects(() => deleteRole('t1', 'r1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 404);
      return true;
    });
  });

  it('throws 409 when deleting a System role', async () => {
    findUniqueRole = role({ isSystem: true });
    await assert.rejects(() => deleteRole('t1', 'r1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 409);
      assert.equal((err as Error).message, 'System roles cannot be deleted');
      return true;
    });
  });

  it('throws 409 when members are still assigned to the role, pluralized correctly', async () => {
    findUniqueRole = role({ isSystem: false, _count: { users: 1 } });
    await assert.rejects(() => deleteRole('t1', 'r1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 409);
      assert.match((err as Error).message, /assigned to 1 member\. Reassign/);
      return true;
    });

    findUniqueRole = role({ isSystem: false, _count: { users: 3 } });
    await assert.rejects(() => deleteRole('t1', 'r1', 'actor1'), (err: unknown) => {
      assert.match((err as Error).message, /assigned to 3 members\. Reassign/);
      return true;
    });
  });

  it('deletes an unassigned custom role and audits the removal', async () => {
    findUniqueRole = role({ isSystem: false, _count: { users: 0 } });
    await deleteRole('t1', 'r1', 'actor1');
    assert.equal(calls.delete.length, 1);
    const audit = calls.auditCreate[0] as { data: { action: string; entity: string } };
    assert.equal(audit.data.action, 'delete');
    assert.equal(audit.data.entity, 'Role');
  });
});
