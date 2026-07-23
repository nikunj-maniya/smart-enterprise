import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { createProject, deleteProject, listProjects, updateProject } from './projects.service.js';

/**
 * Stubbed-Prisma suite (departments.service.test.ts pattern): PrismaClient exposes its delegates
 * via a proxy `get` trap, so `mock.method` can't see them — redefine every delegate this service
 * reads or writes as an in-memory stub, reset in `beforeEach`. `prisma.$transaction` is stubbed to
 * just invoke its callback with a `tx` object backed by the same delegate stubs, since project
 * create/update run inside a transaction alongside an audit-log write.
 */

type MemberRow = { user: { id: string; name: string }; roleInProject: string };
type ProjectRow = {
  id: string;
  tenantId?: string;
  name: string;
  status: string;
  members: MemberRow[];
};

function projectRow(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return { id: 'p1', name: 'Apollo', status: 'active', members: [], ...overrides };
}

let projectRows: ProjectRow[] = [];
let projectTotal = 0;
let existingProject: (ProjectRow & { tenantId: string }) | null = null;
let userCount = 0;
let memberCount = 0;
let requestCount = 0;
let txCreateResult: ProjectRow = projectRow();
let txUpdateResult: ProjectRow = projectRow();

const calls = {
  projectFindMany: [] as unknown[],
  projectCount: [] as unknown[],
  projectFindUnique: [] as unknown[],
  userCount: [] as unknown[],
  projectMemberCount: [] as unknown[],
  requestCount: [] as unknown[],
  transactions: 0,
  txProjectCreate: [] as unknown[],
  txProjectUpdate: [] as unknown[],
  txProjectDelete: [] as unknown[],
  txProjectMemberDeleteMany: [] as unknown[],
  txAuditLogCreate: [] as unknown[],
};

const txStub = {
  project: {
    create: async (args: unknown) => {
      calls.txProjectCreate.push(args);
      return txCreateResult;
    },
    update: async (args: unknown) => {
      calls.txProjectUpdate.push(args);
      return txUpdateResult;
    },
    delete: async (args: unknown) => {
      calls.txProjectDelete.push(args);
    },
  },
  projectMember: {
    deleteMany: async (args: unknown) => {
      calls.txProjectMemberDeleteMany.push(args);
    },
  },
  auditLog: {
    create: async (args: unknown) => {
      calls.txAuditLogCreate.push(args);
    },
  },
};

Object.defineProperty(prisma, 'project', {
  value: {
    findMany: async (args: unknown) => {
      calls.projectFindMany.push(args);
      return projectRows;
    },
    count: async (args: unknown) => {
      calls.projectCount.push(args);
      return projectTotal;
    },
    findUnique: async (args: unknown) => {
      calls.projectFindUnique.push(args);
      return existingProject;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: {
    count: async (args: unknown) => {
      calls.userCount.push(args);
      return userCount;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'projectMember', {
  value: {
    count: async (args: unknown) => {
      calls.projectMemberCount.push(args);
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

const withMembers = {
  members: { include: { user: { select: { id: true, name: true } } } },
} as const;

beforeEach(() => {
  projectRows = [];
  projectTotal = 0;
  existingProject = null;
  userCount = 0;
  memberCount = 0;
  requestCount = 0;
  txCreateResult = projectRow();
  txUpdateResult = projectRow();
  for (const arr of Object.values(calls)) {
    if (Array.isArray(arr)) arr.length = 0;
  }
  calls.transactions = 0;
});

describe('listProjects', () => {
  it('applies tenant scoping, status, search, and pagination', async () => {
    projectRows = [projectRow()];
    projectTotal = 1;

    await listProjects('t1', { page: 2, pageSize: 10, search: 'apollo', status: 'active' });

    assert.deepEqual(calls.projectFindMany[0], {
      where: { tenantId: 't1', status: 'active', name: { contains: 'apollo', mode: 'insensitive' } },
      include: withMembers,
      orderBy: { name: 'asc' },
      skip: 10,
      take: 10,
    });
    assert.deepEqual(calls.projectCount[0], {
      where: { tenantId: 't1', status: 'active', name: { contains: 'apollo', mode: 'insensitive' } },
    });
  });

  it('omits status and search from the where clause when not provided', async () => {
    await listProjects('t1', { page: 1, pageSize: 20 });

    assert.deepEqual((calls.projectFindMany[0] as { where: unknown }).where, { tenantId: 't1' });
  });

  it('maps PM, Tech Lead, and members separately by roleInProject', async () => {
    projectRows = [
      projectRow({
        members: [
          { user: { id: 'pm1', name: 'Pat' }, roleInProject: 'PM' },
          { user: { id: 'tl1', name: 'Tara' }, roleInProject: 'TL' },
          { user: { id: 'm1', name: 'Mo' }, roleInProject: 'member' },
        ],
      }),
    ];
    projectTotal = 1;

    const res = await listProjects('t1', { page: 1, pageSize: 20 });

    assert.deepEqual(res.rows[0].pm, { id: 'pm1', name: 'Pat' });
    assert.deepEqual(res.rows[0].techLead, { id: 'tl1', name: 'Tara' });
    assert.deepEqual(res.rows[0].members, [{ id: 'm1', name: 'Mo' }]);
    assert.equal(res.rows[0].memberCount, 1);
  });

  it('reports null pm/techLead when no one holds those roles', async () => {
    projectRows = [projectRow({ members: [{ user: { id: 'm1', name: 'Mo' }, roleInProject: 'member' }] })];
    projectTotal = 1;

    const res = await listProjects('t1', { page: 1, pageSize: 20 });

    assert.equal(res.rows[0].pm, null);
    assert.equal(res.rows[0].techLead, null);
  });
});

const baseInput = { name: 'Apollo', status: 'active' as const, pmUserId: null, techLeadUserId: null, memberIds: [] };

describe('createProject (member assignment)', () => {
  it('rejects when the PM and Tech Lead are the same person, before touching Prisma', async () => {
    await assert.rejects(
      createProject('t1', 'actor1', { ...baseInput, pmUserId: 'u1', techLeadUserId: 'u1' }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.equal(err.message, 'The PM and Tech Lead must be different people');
        return true;
      },
    );
    assert.equal(calls.userCount.length, 0);
    assert.equal(calls.transactions, 0);
  });

  it('rejects a member id that is not a tenant user, before opening a transaction', async () => {
    userCount = 1; // 2 ids requested, only 1 resolves within the tenant

    await assert.rejects(
      createProject('t1', 'actor1', { ...baseInput, memberIds: ['u1', 'u2'] }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.equal(err.message, 'One or more selected people are not members of this enterprise');
        return true;
      },
    );
    assert.equal(calls.transactions, 0);
  });

  it('skips the tenant-membership check entirely when no people are assigned', async () => {
    await createProject('t1', 'actor1', baseInput);

    assert.equal(calls.userCount.length, 0);
  });

  it('dedupes memberIds and excludes the PM/Tech Lead from the member-only rows', async () => {
    userCount = 3; // pm1, tl1, m1 all validated

    await createProject('t1', 'actor1', {
      ...baseInput,
      pmUserId: 'pm1',
      techLeadUserId: 'tl1',
      memberIds: ['m1', 'm1', 'pm1'], // duplicate + a lead id sneaking into memberIds
    });

    assert.deepEqual(calls.userCount[0], { where: { tenantId: 't1', id: { in: ['pm1', 'tl1', 'm1'] } } });
    assert.deepEqual((calls.txProjectCreate[0] as { data: { members: { create: unknown[] } } }).data.members, {
      create: [
        { userId: 'pm1', roleInProject: 'PM' },
        { userId: 'tl1', roleInProject: 'TL' },
        { userId: 'm1', roleInProject: 'member' },
      ],
    });
  });

  it('creates the project inside a transaction and logs the create action', async () => {
    txCreateResult = projectRow({ id: 'p9', name: 'Apollo' });

    const dto = await createProject('t1', 'actor1', baseInput);

    assert.equal(calls.transactions, 1);
    assert.deepEqual((calls.txProjectCreate[0] as { data: unknown }).data, {
      tenantId: 't1',
      name: 'Apollo',
      status: 'active',
      members: { create: [] },
    });
    assert.deepEqual(calls.txAuditLogCreate[0], {
      data: {
        tenantId: 't1',
        actorId: 'actor1',
        entity: 'Project',
        entityId: 'p9',
        action: 'create',
        after: { name: 'Apollo', status: 'active', members: [] },
      },
    });
    assert.equal(dto.id, 'p9');
  });
});

describe('updateProject', () => {
  it('throws 404 when the project does not exist', async () => {
    existingProject = null;
    await assert.rejects(
      updateProject('t1', 'missing', 'actor1', baseInput),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('throws 404 when the project belongs to another tenant', async () => {
    existingProject = { ...projectRow(), tenantId: 't2' };
    await assert.rejects(
      updateProject('t1', 'p1', 'actor1', baseInput),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('replaces members (deleteMany + create) and logs before/after in the audit entry', async () => {
    existingProject = { ...projectRow({ name: 'Old Name', status: 'active' }), tenantId: 't1' };
    txUpdateResult = projectRow({ name: 'New Name', status: 'archived' });

    const dto = await updateProject('t1', 'p1', 'actor1', { ...baseInput, name: 'New Name', status: 'archived' });

    assert.deepEqual(calls.txProjectMemberDeleteMany[0], { where: { projectId: 'p1' } });
    assert.deepEqual((calls.txProjectUpdate[0] as { data: unknown }).data, {
      name: 'New Name',
      status: 'archived',
      members: { create: [] },
    });
    assert.deepEqual(calls.txAuditLogCreate[0], {
      data: {
        tenantId: 't1',
        actorId: 'actor1',
        entity: 'Project',
        entityId: 'p1',
        action: 'update',
        before: { name: 'Old Name', status: 'active' },
        after: { name: 'New Name', status: 'archived', members: [] },
      },
    });
    assert.equal(dto.name, 'New Name');
  });
});

describe('deleteProject', () => {
  it('throws 404 when the project does not exist or belongs to another tenant', async () => {
    existingProject = null;
    await assert.rejects(
      deleteProject('t1', 'missing', 'actor1'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('blocks deletion when people are assigned (409), before checking requests', async () => {
    existingProject = { ...projectRow(), tenantId: 't1' };
    memberCount = 2;
    requestCount = 5;

    await assert.rejects(deleteProject('t1', 'p1', 'actor1'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 409);
      assert.equal(
        err.message,
        'This project has assigned people (PM, Tech Lead, or members). Clear them before deleting it.',
      );
      return true;
    });
    assert.equal(calls.transactions, 0);
  });

  it('blocks deletion when requests reference the project (409)', async () => {
    existingProject = { ...projectRow(), tenantId: 't1' };
    memberCount = 0;
    requestCount = 3;

    await assert.rejects(deleteProject('t1', 'p1', 'actor1'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 409);
      assert.equal(err.message, 'Requests reference this project, so it can’t be deleted.');
      return true;
    });
    assert.equal(calls.transactions, 0);
  });

  it('deletes the project and logs the delete action when clear of members and requests', async () => {
    existingProject = { ...projectRow({ name: 'Apollo', status: 'active' }), tenantId: 't1' };
    memberCount = 0;
    requestCount = 0;

    await deleteProject('t1', 'p1', 'actor1');

    assert.deepEqual(calls.txProjectDelete[0], { where: { id: 'p1' } });
    assert.deepEqual(calls.txAuditLogCreate[0], {
      data: {
        tenantId: 't1',
        actorId: 'actor1',
        entity: 'Project',
        entityId: 'p1',
        action: 'delete',
        before: { name: 'Apollo', status: 'active' },
      },
    });
  });
});
