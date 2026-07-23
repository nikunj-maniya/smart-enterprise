import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import {
  approveOrgUser,
  createOrgUser,
  deactivateOrgUser,
  deleteOrgUser,
  getOrgUserStats,
  listOrgUserOptions,
  listOrgUsers,
  reactivateOrgUser,
  rejectOrgUser,
  resetOrgUserPassword,
  updateOrgUser,
} from './org-users.service.js';

/**
 * PrismaClient exposes its delegates via a proxy `get` trap, so `mock.method` can't see them —
 * redefine every delegate this service (and the `initializeUserLeaveBalances` helper it calls
 * mid-transaction) reads/writes as stubs backed by the mutable rows below (forms.service.test.ts
 * pattern). `$transaction`'s callback form receives `prisma` itself as the tx client, which works
 * because every delegate it could touch is stubbed on the same singleton.
 */

type UserRow = {
  id: string;
  tenantId: string | null;
  name: string;
  email: string;
  status: string;
  createdAt: Date;
  roles: { role: { id: string; name: string } }[];
  departments: { department: { id: string; name: string } }[];
};

let userRows: UserRow[] = [];
let userCount = 0;
let findUniqueUser: UserRow | null = null;
let findUniqueByEmail: UserRow | null = null;
let roleCount = 0;
let departmentCount = 0;
let departmentHeadCount = 0;
let projectMemberCount = 0;
let requestCount = 0;
let leaveTypeRows: { id: string; quota: number }[] = [];
const roleNameById: Record<string, string> = { r1: 'Employee' };
const departmentNameById: Record<string, string> = { d1: 'Engineering' };

const calls = {
  userCreate: [] as unknown[],
  userUpdate: [] as unknown[],
  userDelete: [] as unknown[],
  auditCreate: [] as unknown[],
  userRoleDeleteMany: [] as unknown[],
  userDepartmentDeleteMany: [] as unknown[],
  passwordResetTokenDeleteMany: [] as unknown[],
  leaveBalanceUpsert: [] as unknown[],
};

function withRelations(u: UserRow) {
  return u;
}

Object.defineProperty(prisma, 'user', {
  value: {
    findMany: async () => userRows,
    count: async () => userCount,
    findUnique: async (args: {
      where: { id?: string; email?: string };
      include?: { roles?: { select?: { roleId?: boolean } } };
    }) => {
      if (args.where.email !== undefined) return findUniqueByEmail;
      if (!findUniqueUser) return null;
      // updateOrgUser's `existing` lookup selects { roleId } / { departmentId } directly,
      // rather than the { role: { id, name } } shape used everywhere else — derive it on the fly.
      if (args.include?.roles?.select?.roleId) {
        return {
          ...findUniqueUser,
          roles: findUniqueUser.roles.map((r) => ({ roleId: r.role.id })),
          departments: findUniqueUser.departments.map((d) => ({ departmentId: d.department.id })),
        };
      }
      return findUniqueUser;
    },
    create: async (args: { data: unknown }) => {
      calls.userCreate.push(args);
      return withRelations({
        id: 'new-user',
        tenantId: 't1',
        name: (args.data as { name: string }).name,
        email: (args.data as { email: string }).email,
        status: 'Active',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        roles: [],
        departments: [],
      });
    },
    update: async (args: {
      where: { id: string };
      data: {
        roles?: { create: { roleId: string }[] };
        departments?: { create: { departmentId: string }[] };
      } & Record<string, unknown>;
    }) => {
      calls.userUpdate.push(args);
      const { roles: rolesWrite, departments: departmentsWrite, ...rest } = args.data;
      const roles = rolesWrite
        ? rolesWrite.create.map((c) => ({ role: { id: c.roleId, name: roleNameById[c.roleId] ?? c.roleId } }))
        : (findUniqueUser as UserRow).roles;
      const departments = departmentsWrite
        ? departmentsWrite.create.map((c) => ({
            department: { id: c.departmentId, name: departmentNameById[c.departmentId] ?? c.departmentId },
          }))
        : (findUniqueUser as UserRow).departments;
      return withRelations({ ...(findUniqueUser as UserRow), ...rest, roles, departments });
    },
    delete: async (args: { where: { id: string } }) => {
      calls.userDelete.push(args);
      return findUniqueUser;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'role', {
  value: { count: async () => roleCount },
  configurable: true,
});
Object.defineProperty(prisma, 'department', {
  value: { count: async () => departmentCount },
  configurable: true,
});
Object.defineProperty(prisma, 'departmentHead', {
  value: { count: async () => departmentHeadCount },
  configurable: true,
});
Object.defineProperty(prisma, 'projectMember', {
  value: { count: async () => projectMemberCount },
  configurable: true,
});
Object.defineProperty(prisma, 'request', {
  value: { count: async () => requestCount },
  configurable: true,
});
Object.defineProperty(prisma, 'userRole', {
  value: {
    deleteMany: async (args: unknown) => {
      calls.userRoleDeleteMany.push(args);
      return { count: 0 };
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'userDepartment', {
  value: {
    deleteMany: async (args: unknown) => {
      calls.userDepartmentDeleteMany.push(args);
      return { count: 0 };
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'passwordResetToken', {
  value: {
    deleteMany: async (args: unknown) => {
      calls.passwordResetTokenDeleteMany.push(args);
      return { count: 0 };
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'leaveType', {
  value: { findMany: async () => leaveTypeRows },
  configurable: true,
});
Object.defineProperty(prisma, 'leaveBalance', {
  value: {
    upsert: async (args: unknown) => {
      calls.leaveBalanceUpsert.push(args);
      return args;
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
  userRows = [];
  userCount = 0;
  findUniqueUser = null;
  findUniqueByEmail = null;
  roleCount = 0;
  departmentCount = 0;
  departmentHeadCount = 0;
  projectMemberCount = 0;
  requestCount = 0;
  leaveTypeRows = [];
  for (const key of Object.keys(calls) as (keyof typeof calls)[]) calls[key].length = 0;
}

const CREATE_INPUT = {
  name: 'Asha Patel',
  email: 'asha@acme.com',
  password: 'password123',
  roleIds: ['r1'],
  departmentIds: ['d1'],
};

describe('listOrgUsers', () => {
  beforeEach(resetAll);

  it('scopes the query to the tenant and maps roles/departments to id+name pairs', async () => {
    userRows = [
      {
        id: 'u1',
        tenantId: 't1',
        name: 'Asha',
        email: 'asha@acme.com',
        status: 'Active',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        roles: [{ role: { id: 'r1', name: 'Employee' } }],
        departments: [{ department: { id: 'd1', name: 'Engineering' } }],
      },
    ];
    userCount = 1;
    const res = await listOrgUsers('t1', { page: 1, pageSize: 20 });
    assert.equal(res.total, 1);
    assert.deepEqual(res.rows[0].roles, [{ id: 'r1', name: 'Employee' }]);
    assert.deepEqual(res.rows[0].departments, [{ id: 'd1', name: 'Engineering' }]);
  });
});

describe('listOrgUserOptions', () => {
  beforeEach(resetAll);

  it('returns the picker shape (id, name) without throwing', async () => {
    const res = await listOrgUserOptions('t1');
    assert.deepEqual(res, []);
  });
});

describe('getOrgUserStats', () => {
  beforeEach(resetAll);

  it('aggregates active/inactive/pending user counts and department count', async () => {
    // Distinguish each count call in a deterministic order isn't asserted here — only that
    // the shape matches OrgUserStats and department count flows through independently.
    departmentCount = 4;
    const res = await getOrgUserStats('t1');
    assert.equal(res.departments, 4);
    assert.ok(typeof res.active === 'number');
    assert.ok(typeof res.inactive === 'number');
    assert.ok(typeof res.pending === 'number');
  });
});

describe('createOrgUser', () => {
  beforeEach(resetAll);

  it('throws 409 when the email is already registered', async () => {
    findUniqueByEmail = {
      id: 'existing',
      tenantId: 't1',
      name: 'X',
      email: 'asha@acme.com',
      status: 'Active',
      createdAt: new Date(),
      roles: [],
      departments: [],
    };
    await assert.rejects(
      () => createOrgUser('t1', 'actor1', CREATE_INPUT),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 409);
        assert.equal((err as Error).message, 'This email is already registered.');
        return true;
      },
    );
  });

  it('throws 400 when a role id does not belong to this tenant', async () => {
    roleCount = 0; // fewer matches than requested role ids
    await assert.rejects(
      () => createOrgUser('t1', 'actor1', CREATE_INPUT),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 400);
        assert.match((err as Error).message, /roles do not belong/);
        return true;
      },
    );
  });

  it('throws 400 when a department id does not belong to this tenant', async () => {
    roleCount = 1;
    departmentCount = 0;
    await assert.rejects(
      () => createOrgUser('t1', 'actor1', CREATE_INPUT),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 400);
        assert.match((err as Error).message, /departments do not belong/);
        return true;
      },
    );
  });

  it('creates the user, seeds leave balances, and audits the creation', async () => {
    roleCount = 1;
    departmentCount = 1;
    leaveTypeRows = [{ id: 'lt1', quota: 12 }];

    const dto = await createOrgUser('t1', 'actor1', CREATE_INPUT);

    assert.equal(dto.name, 'Asha Patel');
    assert.equal(calls.userCreate.length, 1);
    assert.equal(calls.leaveBalanceUpsert.length, 1);
    const audit = calls.auditCreate[0] as { data: { action: string; entity: string } };
    assert.equal(audit.data.action, 'create');
    assert.equal(audit.data.entity, 'User');
  });
});

describe('updateOrgUser', () => {
  beforeEach(resetAll);

  it('throws 404 when the user does not exist in this tenant', async () => {
    findUniqueUser = null;
    await assert.rejects(
      () => updateOrgUser('t1', 'missing', 'actor1', { name: 'X', roleIds: [], departmentIds: [] }),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 404);
        return true;
      },
    );
  });

  it('throws 404 when the user belongs to a different tenant', async () => {
    findUniqueUser = {
      id: 'u1',
      tenantId: 'other-tenant',
      name: 'Asha',
      email: 'asha@acme.com',
      status: 'Active',
      createdAt: new Date(),
      roles: [],
      departments: [],
    };
    await assert.rejects(
      () => updateOrgUser('t1', 'u1', 'actor1', { name: 'X', roleIds: [], departmentIds: [] }),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 404);
        return true;
      },
    );
  });

  it('throws 400 on a role id outside the tenant', async () => {
    findUniqueUser = {
      id: 'u1',
      tenantId: 't1',
      name: 'Asha',
      email: 'asha@acme.com',
      status: 'Active',
      createdAt: new Date(),
      roles: [],
      departments: [],
    };
    roleCount = 0;
    await assert.rejects(
      () => updateOrgUser('t1', 'u1', 'actor1', { name: 'X', roleIds: ['bad-role'], departmentIds: [] }),
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 400);
        return true;
      },
    );
  });

  it('replaces roles/departments and audits before/after on success', async () => {
    findUniqueUser = {
      id: 'u1',
      tenantId: 't1',
      name: 'Old Name',
      email: 'asha@acme.com',
      status: 'Active',
      createdAt: new Date(),
      roles: [{ role: { id: 'old-role', name: 'X' } }],
      departments: [],
    };
    roleCount = 1;
    departmentCount = 1;

    const dto = await updateOrgUser('t1', 'u1', 'actor1', {
      name: 'New Name',
      roleIds: ['r1'],
      departmentIds: ['d1'],
    });

    assert.equal(dto.name, 'New Name');
    const updateArgs = calls.userUpdate[0] as { data: { roles: { deleteMany: unknown; create: unknown[] } } };
    assert.deepEqual(updateArgs.data.roles.create, [{ roleId: 'r1' }]);
    const audit = calls.auditCreate[0] as { data: { before: { roleIds: string[] }; after: { roleIds: string[] } } };
    assert.deepEqual(audit.data.before.roleIds, ['old-role']);
    assert.deepEqual(audit.data.after.roleIds, ['r1']);
  });
});

const EXISTING = {
  id: 'u1',
  tenantId: 't1',
  name: 'Asha',
  email: 'asha@acme.com',
  status: 'Active',
  createdAt: new Date(),
  roles: [],
  departments: [],
};

describe('deleteOrgUser', () => {
  beforeEach(() => {
    resetAll();
    findUniqueUser = { ...EXISTING };
  });

  it('throws 404 for a user outside this tenant', async () => {
    findUniqueUser = { ...EXISTING, tenantId: 'other' };
    await assert.rejects(() => deleteOrgUser('t1', 'u1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 404);
      return true;
    });
  });

  it('throws 400 when removing your own account', async () => {
    await assert.rejects(() => deleteOrgUser('t1', 'u1', 'u1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 400);
      return true;
    });
  });

  it('throws 409 when the user heads a department', async () => {
    departmentHeadCount = 2;
    await assert.rejects(() => deleteOrgUser('t1', 'u1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 409);
      assert.match((err as Error).message, /heads 2 departments/);
      return true;
    });
  });

  it('throws 409 when the user is assigned to a project', async () => {
    projectMemberCount = 1;
    await assert.rejects(() => deleteOrgUser('t1', 'u1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 409);
      assert.match((err as Error).message, /1 project/);
      return true;
    });
  });

  it('throws 409 when the user has submitted requests', async () => {
    requestCount = 3;
    await assert.rejects(() => deleteOrgUser('t1', 'u1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 409);
      assert.match((err as Error).message, /Deactivate them instead/);
      return true;
    });
  });

  it('deletes the user and cascades cleanup + audit when unblocked', async () => {
    await deleteOrgUser('t1', 'u1', 'actor1');
    assert.equal(calls.userRoleDeleteMany.length, 1);
    assert.equal(calls.userDepartmentDeleteMany.length, 1);
    assert.equal(calls.passwordResetTokenDeleteMany.length, 1);
    assert.equal(calls.userDelete.length, 1);
    const audit = calls.auditCreate[0] as { data: { action: string } };
    assert.equal(audit.data.action, 'remove');
  });
});

describe('deactivateOrgUser / reactivateOrgUser', () => {
  beforeEach(() => {
    resetAll();
    findUniqueUser = { ...EXISTING, status: 'Active' };
  });

  it('deactivate: throws 400 on self-deactivation', async () => {
    await assert.rejects(() => deactivateOrgUser('t1', 'u1', 'u1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 400);
      return true;
    });
  });

  it('deactivate: throws 409 when already inactive', async () => {
    findUniqueUser = { ...EXISTING, status: 'Inactive' };
    await assert.rejects(() => deactivateOrgUser('t1', 'u1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 409);
      return true;
    });
  });

  it('deactivate: sets status Inactive and audits before/after', async () => {
    const dto = await deactivateOrgUser('t1', 'u1', 'actor1');
    assert.equal(dto.status, 'Inactive');
    const audit = calls.auditCreate[0] as { data: { before: { status: string }; after: { status: string } } };
    assert.equal(audit.data.before.status, 'Active');
    assert.equal(audit.data.after.status, 'Inactive');
  });

  it('reactivate: throws 409 when already active', async () => {
    await assert.rejects(() => reactivateOrgUser('t1', 'u1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 409);
      return true;
    });
  });

  it('reactivate: sets status Active and re-seeds leave balances', async () => {
    findUniqueUser = { ...EXISTING, status: 'Inactive' };
    leaveTypeRows = [{ id: 'lt1', quota: 12 }];
    const dto = await reactivateOrgUser('t1', 'u1', 'actor1');
    assert.equal(dto.status, 'Active');
    assert.equal(calls.leaveBalanceUpsert.length, 1);
  });
});

describe('approveOrgUser / rejectOrgUser', () => {
  beforeEach(resetAll);

  it('approve: throws 409 when the user is not pending', async () => {
    findUniqueUser = { ...EXISTING, status: 'Active' };
    await assert.rejects(() => approveOrgUser('t1', 'u1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 409);
      return true;
    });
  });

  it('approve: activates a pending self-registration and seeds leave balances', async () => {
    findUniqueUser = { ...EXISTING, status: 'Pending' };
    leaveTypeRows = [{ id: 'lt1', quota: 12 }];
    const dto = await approveOrgUser('t1', 'u1', 'actor1');
    assert.equal(dto.status, 'Active');
    assert.equal(calls.leaveBalanceUpsert.length, 1);
    const audit = calls.auditCreate[0] as { data: { action: string } };
    assert.equal(audit.data.action, 'approve');
  });

  it('reject: throws 409 when the user is not pending', async () => {
    findUniqueUser = { ...EXISTING, status: 'Active' };
    await assert.rejects(() => rejectOrgUser('t1', 'u1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 409);
      return true;
    });
  });

  it('reject: discards a pending self-registration and cascades cleanup', async () => {
    findUniqueUser = { ...EXISTING, status: 'Pending' };
    await rejectOrgUser('t1', 'u1', 'actor1');
    assert.equal(calls.userDelete.length, 1);
    const audit = calls.auditCreate[0] as { data: { action: string } };
    assert.equal(audit.data.action, 'reject_self_registration');
  });
});

describe('resetOrgUserPassword', () => {
  beforeEach(resetAll);

  it('throws 404 for a user outside this tenant', async () => {
    findUniqueUser = { ...EXISTING, tenantId: 'other' };
    await assert.rejects(() => resetOrgUserPassword('t1', 'u1', 'actor1'), (err: unknown) => {
      assert.equal((err as { status: number }).status, 404);
      return true;
    });
  });

  it('issues a temporary password and audits the reset', async () => {
    findUniqueUser = { ...EXISTING };
    const res = await resetOrgUserPassword('t1', 'u1', 'actor1');
    assert.equal(typeof res.temporaryPassword, 'string');
    const audit = calls.auditCreate[0] as { data: { action: string } };
    assert.equal(audit.data.action, 'password_reset');
  });
});
