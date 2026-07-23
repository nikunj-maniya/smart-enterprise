import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { searchDirectoryProjects, searchDirectoryUsers } from './directory.service.js';

/**
 * Stubbed-Prisma suite (forms.service.test.ts pattern): PrismaClient exposes its delegates via a
 * proxy `get` trap, so `mock.method` can't see them — redefine the two delegates this service
 * reads as stubs, reset in `beforeEach`. Exercises the where-clause construction (tenant scope,
 * active-only, optional role/department/search narrowing) rather than real DB results.
 */

let userRows: unknown[] = [];
let projectRows: unknown[] = [];
const findManyArgs = { user: [] as unknown[], project: [] as unknown[] };

Object.defineProperty(prisma, 'user', {
  value: {
    findMany: async (args: unknown) => {
      findManyArgs.user.push(args);
      return userRows;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'project', {
  value: {
    findMany: async (args: unknown) => {
      findManyArgs.project.push(args);
      return projectRows;
    },
  },
  configurable: true,
});

beforeEach(() => {
  userRows = [];
  projectRows = [];
  findManyArgs.user.length = 0;
  findManyArgs.project.length = 0;
});

describe('searchDirectoryUsers', () => {
  it('scopes to the tenant, active users only, ordered by name, capped at the given limit', async () => {
    await searchDirectoryUsers('t1', { limit: 20 });

    assert.deepEqual(findManyArgs.user[0], {
      where: { tenantId: 't1', status: 'Active' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
  });

  it('adds a role filter only when roles are given', async () => {
    await searchDirectoryUsers('t1', { limit: 20, roles: ['hr-head', 'tech-lead'] });

    assert.deepEqual((findManyArgs.user[0] as { where: Record<string, unknown> }).where, {
      tenantId: 't1',
      status: 'Active',
      roles: { some: { role: { key: { in: ['hr-head', 'tech-lead'] } } } },
    });
  });

  it('adds a department filter only when departments are given', async () => {
    await searchDirectoryUsers('t1', { limit: 20, departments: ['d1', 'd2'] });

    assert.deepEqual((findManyArgs.user[0] as { where: Record<string, unknown> }).where, {
      tenantId: 't1',
      status: 'Active',
      departments: { some: { departmentId: { in: ['d1', 'd2'] } } },
    });
  });

  it('adds a name/email OR search filter only when search is given', async () => {
    await searchDirectoryUsers('t1', { limit: 20, search: 'ali' });

    assert.deepEqual((findManyArgs.user[0] as { where: Record<string, unknown> }).where, {
      tenantId: 't1',
      status: 'Active',
      OR: [
        { name: { contains: 'ali', mode: 'insensitive' } },
        { email: { contains: 'ali', mode: 'insensitive' } },
      ],
    });
  });

  it('combines role, department, and search filters together', async () => {
    await searchDirectoryUsers('t1', { limit: 5, roles: ['hr-head'], departments: ['d1'], search: 'ali' });

    assert.deepEqual((findManyArgs.user[0] as { where: Record<string, unknown> }).where, {
      tenantId: 't1',
      status: 'Active',
      roles: { some: { role: { key: { in: ['hr-head'] } } } },
      departments: { some: { departmentId: { in: ['d1'] } } },
      OR: [
        { name: { contains: 'ali', mode: 'insensitive' } },
        { email: { contains: 'ali', mode: 'insensitive' } },
      ],
    });
  });

  it('returns the rows Prisma resolves, unmodified', async () => {
    userRows = [{ id: 'u1', name: 'Alice', email: 'alice@x.com' }];
    const res = await searchDirectoryUsers('t1', { limit: 20 });
    assert.deepEqual(res, userRows);
  });
});

describe('searchDirectoryProjects', () => {
  it('scopes to the tenant, active projects only, ordered by name, capped at the given limit', async () => {
    await searchDirectoryProjects('t1', { limit: 10 });

    assert.deepEqual(findManyArgs.project[0], {
      where: { tenantId: 't1', status: 'active' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 10,
    });
  });

  it('adds a name search filter only when search is given', async () => {
    await searchDirectoryProjects('t1', { limit: 10, search: 'apollo' });

    assert.deepEqual((findManyArgs.project[0] as { where: Record<string, unknown> }).where, {
      tenantId: 't1',
      status: 'active',
      name: { contains: 'apollo', mode: 'insensitive' },
    });
  });

  it('returns the rows Prisma resolves, unmodified', async () => {
    projectRows = [{ id: 'p1', name: 'Apollo' }];
    const res = await searchDirectoryProjects('t1', { limit: 10 });
    assert.deepEqual(res, projectRows);
  });
});
