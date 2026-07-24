import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  setDepartmentArchived,
  updateDepartment,
} from './departments.service.js';

/**
 * Stubbed-Prisma suite (forms.service.test.ts pattern): PrismaClient exposes its delegates via a
 * proxy `get` trap, so `mock.method` can't see them — redefine every delegate this service reads
 * or writes as an in-memory stub, reset in `beforeEach`. `prisma.$transaction` is stubbed to just
 * invoke its callback with a `tx` object backed by the same delegate stubs, since department
 * mutations run inside a transaction alongside an audit-log write.
 */

type DeptRow = {
  id: string;
  tenantId?: string;
  name: string;
  archived: boolean;
  heads: { user: { id: string; name: string } }[];
  _count: { users: number };
};

function deptRow(overrides: Partial<DeptRow> = {}): DeptRow {
  return { id: 'd1', name: 'Engineering', archived: false, heads: [], _count: { users: 0 }, ...overrides };
}

let departmentRows: DeptRow[] = [];
let departmentTotal = 0;
let existingDept: (DeptRow & { tenantId: string; heads: { userId: string }[] }) | null = null;
let userRows: { id: string }[] = [];
let memberCount = 0;
let requestCount = 0;
let txCreateResult: DeptRow = deptRow();
let txUpdateResult: DeptRow = deptRow();

const calls = {
  departmentFindMany: [] as unknown[],
  departmentCount: [] as unknown[],
  userFindMany: [] as unknown[],
  departmentFindUnique: [] as unknown[],
  userDepartmentCount: [] as unknown[],
  requestCount: [] as unknown[],
  transactions: 0,
  txDepartmentCreate: [] as unknown[],
  txDepartmentUpdate: [] as unknown[],
  txDepartmentDelete: [] as unknown[],
  txDepartmentHeadDeleteMany: [] as unknown[],
  txAuditLogCreate: [] as unknown[],
};

const txStub = {
  department: {
    create: async (args: unknown) => {
      calls.txDepartmentCreate.push(args);
      return txCreateResult;
    },
    update: async (args: unknown) => {
      calls.txDepartmentUpdate.push(args);
      return txUpdateResult;
    },
    delete: async (args: unknown) => {
      calls.txDepartmentDelete.push(args);
    },
  },
  departmentHead: {
    deleteMany: async (args: unknown) => {
      calls.txDepartmentHeadDeleteMany.push(args);
    },
  },
  auditLog: {
    create: async (args: unknown) => {
      calls.txAuditLogCreate.push(args);
    },
  },
};

Object.defineProperty(prisma, 'department', {
  value: {
    findMany: async (args: unknown) => {
      calls.departmentFindMany.push(args);
      return departmentRows;
    },
    count: async (args: unknown) => {
      calls.departmentCount.push(args);
      return departmentTotal;
    },
    findUnique: async (args: unknown) => {
      calls.departmentFindUnique.push(args);
      return existingDept;
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
Object.defineProperty(prisma, 'userDepartment', {
  value: {
    count: async (args: unknown) => {
      calls.userDepartmentCount.push(args);
      return memberCount;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'request', {
  value: {
    count: async (args: unknown) => {
      calls.requestCount.push(args);
      return requestCount;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: typeof txStub) => Promise<unknown>) => {
    calls.transactions += 1;
    return fn(txStub);
  },
  configurable: true,
});

beforeEach(() => {
  departmentRows = [];
  departmentTotal = 0;
  existingDept = null;
  userRows = [];
  memberCount = 0;
  requestCount = 0;
  txCreateResult = deptRow();
  txUpdateResult = deptRow();
  for (const arr of Object.values(calls)) {
    if (Array.isArray(arr)) arr.length = 0;
  }
  calls.transactions = 0;
});

describe('listDepartments', () => {
  it('applies tenant scoping, search, archived filter, and pagination', async () => {
    departmentRows = [deptRow({ id: 'd1' })];
    departmentTotal = 1;

    const res = await listDepartments('t1', { page: 2, pageSize: 10, search: 'eng', archived: false });

    assert.deepEqual(calls.departmentFindMany[0], {
      where: { tenantId: 't1', archived: false, name: { contains: 'eng', mode: 'insensitive' } },
      include: {
        heads: { include: { user: { select: { id: true, name: true } } } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
      skip: 10,
      take: 10,
    });
    assert.deepEqual(calls.departmentCount[0], {
      where: { tenantId: 't1', archived: false, name: { contains: 'eng', mode: 'insensitive' } },
    });
    assert.deepEqual(res, { rows: [{ id: 'd1', name: 'Engineering', heads: [], memberCount: 0, archived: false }], total: 1, page: 2, pageSize: 10 });
  });

  it('omits search and archived from the where clause when not provided', async () => {
    await listDepartments('t1', { page: 1, pageSize: 20 });

    assert.deepEqual(calls.departmentFindMany[0], {
      where: { tenantId: 't1' },
      include: {
        heads: { include: { user: { select: { id: true, name: true } } } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
      skip: 0,
      take: 20,
    });
  });

  it('maps heads and member count into the DTO', async () => {
    departmentRows = [
      deptRow({
        id: 'd1',
        heads: [{ user: { id: 'u1', name: 'Alice' } }, { user: { id: 'u2', name: 'Bob' } }],
        _count: { users: 5 },
      }),
    ];
    departmentTotal = 1;

    const res = await listDepartments('t1', { page: 1, pageSize: 20 });

    assert.deepEqual(res.rows[0], {
      id: 'd1',
      name: 'Engineering',
      heads: [
        { id: 'u1', name: 'Alice' },
        { id: 'u2', name: 'Bob' },
      ],
      memberCount: 5,
      archived: false,
    });
  });
});

describe('createDepartment (head assignment)', () => {
  it('dedupes head ids, validates them as tenant members, and creates with heads', async () => {
    userRows = [{ id: 'u1' }, { id: 'u2' }];
    txCreateResult = deptRow({
      heads: [{ user: { id: 'u1', name: 'Alice' } }, { user: { id: 'u2', name: 'Bob' } }],
    });

    const dto = await createDepartment('t1', 'actor1', { name: 'Engineering', headUserIds: ['u1', 'u2', 'u1'] });

    assert.deepEqual(calls.userFindMany[0], { where: { id: { in: ['u1', 'u2'] }, tenantId: 't1' }, select: { id: true } });
    assert.deepEqual(calls.txDepartmentCreate[0], {
      data: { tenantId: 't1', name: 'Engineering', heads: { create: [{ userId: 'u1' }, { userId: 'u2' }] } },
      include: {
        heads: { include: { user: { select: { id: true, name: true } } } },
        _count: { select: { users: true } },
      },
    });
    assert.deepEqual(calls.txAuditLogCreate[0], {
      data: {
        tenantId: 't1',
        actorId: 'actor1',
        entity: 'Department',
        entityId: 'd1',
        action: 'create',
        after: { name: 'Engineering', headUserIds: ['u1', 'u2'] },
      },
    });
    assert.deepEqual(dto.heads, [
      { id: 'u1', name: 'Alice' },
      { id: 'u2', name: 'Bob' },
    ]);
  });

  it('skips the user lookup entirely when no heads are given', async () => {
    await createDepartment('t1', 'actor1', { name: 'Engineering', headUserIds: [] });

    assert.equal(calls.userFindMany.length, 0);
    assert.deepEqual((calls.txDepartmentCreate[0] as { data: { heads: { create: unknown[] } } }).data.heads, {
      create: [],
    });
  });

  it('rejects a head id that is not a member of the tenant, before opening a transaction', async () => {
    userRows = [{ id: 'u1' }]; // u2 missing

    await assert.rejects(
      createDepartment('t1', 'actor1', { name: 'Engineering', headUserIds: ['u1', 'u2'] }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.equal(err.message, 'One or more selected heads are not members of this enterprise');
        return true;
      },
    );
    assert.equal(calls.transactions, 0);
  });
});

describe('updateDepartment', () => {
  it('throws 404 when the department does not exist', async () => {
    existingDept = null;
    await assert.rejects(
      updateDepartment('t1', 'missing', 'actor1', { name: 'X', headUserIds: [] }),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('throws 404 when the department belongs to another tenant', async () => {
    existingDept = { id: 'd1', tenantId: 't2', name: 'Engineering', archived: false, heads: [], _count: { users: 0 } };
    await assert.rejects(
      updateDepartment('t1', 'd1', 'actor1', { name: 'X', headUserIds: [] }),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('replaces heads (deleteMany + create) and logs before/after in the audit entry', async () => {
    existingDept = {
      id: 'd1',
      tenantId: 't1',
      name: 'Engineering',
      archived: false,
      heads: [{ userId: 'u1', user: { id: 'u1', name: 'Alice' } }],
      _count: { users: 0 },
    };
    userRows = [{ id: 'u2' }];
    txUpdateResult = deptRow({ name: 'Eng Renamed', heads: [{ user: { id: 'u2', name: 'Bob' } }] });

    const dto = await updateDepartment('t1', 'd1', 'actor1', { name: 'Eng Renamed', headUserIds: ['u2'] });

    assert.deepEqual((calls.txDepartmentUpdate[0] as { data: unknown }).data, {
      name: 'Eng Renamed',
      heads: { deleteMany: {}, create: [{ userId: 'u2' }] },
    });
    assert.deepEqual(calls.txAuditLogCreate[0], {
      data: {
        tenantId: 't1',
        actorId: 'actor1',
        entity: 'Department',
        entityId: 'd1',
        action: 'update',
        before: { name: 'Engineering', headUserIds: ['u1'] },
        after: { name: 'Eng Renamed', headUserIds: ['u2'] },
      },
    });
    assert.equal(dto.name, 'Eng Renamed');
  });
});

describe('setDepartmentArchived', () => {
  it('throws 404 when the department does not exist or belongs to another tenant', async () => {
    existingDept = null;
    await assert.rejects(
      setDepartmentArchived('t1', 'missing', 'actor1', true),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('archives a department and logs the archive action with before/after', async () => {
    existingDept = { id: 'd1', tenantId: 't1', name: 'Engineering', archived: false, heads: [], _count: { users: 0 } };
    txUpdateResult = deptRow({ archived: true });

    const dto = await setDepartmentArchived('t1', 'd1', 'actor1', true);

    assert.deepEqual((calls.txDepartmentUpdate[0] as { data: unknown }).data, { archived: true });
    assert.deepEqual(calls.txAuditLogCreate[0], {
      data: {
        tenantId: 't1',
        actorId: 'actor1',
        entity: 'Department',
        entityId: 'd1',
        action: 'archive',
        before: { archived: false },
        after: { archived: true },
      },
    });
    assert.equal(dto.archived, true);
  });

  it('unarchives a department and logs the unarchive action', async () => {
    existingDept = { id: 'd1', tenantId: 't1', name: 'Engineering', archived: true, heads: [], _count: { users: 0 } };
    txUpdateResult = deptRow({ archived: false });

    await setDepartmentArchived('t1', 'd1', 'actor1', false);

    assert.equal((calls.txAuditLogCreate[0] as { data: { action: string } }).data.action, 'unarchive');
  });
});

describe('deleteDepartment', () => {
  it('throws 404 when the department does not exist or belongs to another tenant', async () => {
    existingDept = null;
    await assert.rejects(
      deleteDepartment('t1', 'missing', 'actor1'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('blocks deletion with a singular message when exactly one member is assigned (409)', async () => {
    existingDept = { id: 'd1', tenantId: 't1', name: 'Engineering', archived: false, heads: [], _count: { users: 0 } };
    memberCount = 1;

    await assert.rejects(deleteDepartment('t1', 'd1', 'actor1'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 409);
      assert.equal(err.message, '1 user is assigned to this department. Reassign them before deleting it.');
      return true;
    });
  });

  it('blocks deletion with a plural message when multiple members are assigned (409)', async () => {
    existingDept = { id: 'd1', tenantId: 't1', name: 'Engineering', archived: false, heads: [], _count: { users: 0 } };
    memberCount = 3;

    await assert.rejects(deleteDepartment('t1', 'd1', 'actor1'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.message, '3 users are assigned to this department. Reassign them before deleting it.');
      return true;
    });
  });

  it('blocks deletion when requests reference the department (409), checked only once no members remain', async () => {
    existingDept = { id: 'd1', tenantId: 't1', name: 'Engineering', archived: false, heads: [], _count: { users: 0 } };
    memberCount = 0;
    requestCount = 2;

    await assert.rejects(deleteDepartment('t1', 'd1', 'actor1'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 409);
      assert.equal(err.message, 'Requests reference this department, so it can’t be deleted.');
      return true;
    });
  });

  it('deletes the department heads then the department, and logs the delete action', async () => {
    existingDept = { id: 'd1', tenantId: 't1', name: 'Engineering', archived: false, heads: [], _count: { users: 0 } };
    memberCount = 0;
    requestCount = 0;

    await deleteDepartment('t1', 'd1', 'actor1');

    assert.deepEqual(calls.txDepartmentHeadDeleteMany[0], { where: { departmentId: 'd1' } });
    assert.deepEqual(calls.txDepartmentDelete[0], { where: { id: 'd1' } });
    assert.deepEqual(calls.txAuditLogCreate[0], {
      data: {
        tenantId: 't1',
        actorId: 'actor1',
        entity: 'Department',
        entityId: 'd1',
        action: 'delete',
        before: { name: 'Engineering' },
      },
    });
  });
});
