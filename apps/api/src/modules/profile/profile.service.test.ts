import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { getProfile, updateProfile } from './profile.service.js';

/**
 * Stubbed-Prisma suite (departments.service.test.ts pattern): PrismaClient exposes its delegates
 * via a proxy `get` trap, so `mock.method` can't see them — redefine `prisma.user` (the only
 * delegate this service reads/writes) as an in-memory stub, reset in `beforeEach`.
 */

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  location: string | null;
  roles: { role: { name: string } }[];
  departments: { department: { name: string } }[];
};

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u1',
    name: 'Alice',
    email: 'alice@acme.com',
    phone: null,
    jobTitle: null,
    location: null,
    roles: [],
    departments: [],
    ...overrides,
  };
}

let existingUser: UserRow | null = userRow();
let updatedUser: UserRow = userRow();
const calls = {
  findUnique: [] as unknown[],
  update: [] as unknown[],
};

Object.defineProperty(prisma, 'user', {
  value: {
    findUnique: async (args: unknown) => {
      calls.findUnique.push(args);
      return existingUser;
    },
    update: async (args: unknown) => {
      calls.update.push(args);
      return updatedUser;
    },
  },
  configurable: true,
});

const withRolesAndDepartments = {
  roles: { include: { role: { select: { name: true } } } },
  departments: { include: { department: { select: { name: true } } } },
} as const;

beforeEach(() => {
  existingUser = userRow();
  updatedUser = userRow();
  calls.findUnique.length = 0;
  calls.update.length = 0;
});

describe('getProfile', () => {
  it('maps roles and departments into flat name arrays', async () => {
    existingUser = userRow({
      roles: [{ role: { name: 'Enterprise Admin' } }],
      departments: [{ department: { name: 'Engineering' } }],
    });

    const dto = await getProfile('u1');

    assert.deepEqual(calls.findUnique[0], { where: { id: 'u1' }, include: withRolesAndDepartments });
    assert.deepEqual(dto.roles, ['Enterprise Admin']);
    assert.deepEqual(dto.departments, ['Engineering']);
  });

  it('throws 404 when the user does not exist', async () => {
    existingUser = null;
    await assert.rejects(getProfile('missing'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 404);
      assert.equal(err.message, 'User not found');
      return true;
    });
  });
});

describe('updateProfile', () => {
  it('passes provided optional fields through as-is', async () => {
    updatedUser = userRow({ name: 'Bob', phone: '123', jobTitle: 'Engineer', location: 'Pune' });

    const dto = await updateProfile('u1', {
      name: 'Bob',
      phone: '123',
      jobTitle: 'Engineer',
      location: 'Pune',
    });

    assert.deepEqual(calls.update[0], {
      where: { id: 'u1' },
      data: { name: 'Bob', phone: '123', jobTitle: 'Engineer', location: 'Pune' },
      include: withRolesAndDepartments,
    });
    assert.equal(dto.name, 'Bob');
  });

  it('coalesces omitted optional fields to null rather than undefined', async () => {
    await updateProfile('u1', { name: 'Alice' });

    assert.deepEqual((calls.update[0] as { data: unknown }).data, {
      name: 'Alice',
      phone: null,
      jobTitle: null,
      location: null,
    });
  });
});
