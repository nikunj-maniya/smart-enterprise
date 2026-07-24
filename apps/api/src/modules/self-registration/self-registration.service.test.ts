import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import {
  generateLink,
  getLink,
  getPublicInfo,
  registerViaToken,
  revokeLink,
} from './self-registration.service.js';

/**
 * Stubbed-Prisma suite (forms.service.test.ts / departments.service.test.ts pattern): PrismaClient
 * exposes its delegates via a proxy `get` trap, so `mock.method` can't see them — redefine every
 * delegate this service reads or writes as an in-memory stub, reset in `beforeEach`. This is the
 * public (no-auth) self-signup flow, so token validity/expiry, duplicate-submission handling, and
 * the created-user shape get careful coverage.
 */

type LinkRow = {
  id: string;
  tenantId: string;
  token: string;
  expiresAt: Date;
  createdBy: string;
  tenant?: { name: string; status: string };
};

type UserRow = { id: string; email: string };
type RoleRow = { id: string };

let linkRow: LinkRow | null = null;
let existingUserRow: UserRow | null = null;
let employeeRoleRow: RoleRow | null = null;
let createdUserRow: { id: string; name: string; email: string } = { id: 'u1', name: '', email: '' };

const calls = {
  registrationLinkFindUnique: [] as unknown[],
  registrationLinkUpsert: [] as unknown[],
  registrationLinkDelete: [] as unknown[],
  userFindUnique: [] as unknown[],
  roleFindUnique: [] as unknown[],
  auditLogCreate: [] as unknown[],
  txUserCreate: [] as unknown[],
  txAuditLogCreate: [] as unknown[],
  transactions: 0,
};

const txStub = {
  registrationLink: {
    upsert: async (args: { create: { tenantId: string; token: string; expiresAt: Date; createdBy: string } }) => {
      calls.registrationLinkUpsert.push(args);
      return {
        id: linkRow?.id ?? 'link1',
        tenantId: args.create.tenantId,
        token: args.create.token,
        expiresAt: args.create.expiresAt,
        createdBy: args.create.createdBy,
      };
    },
  },
  user: {
    create: async (args: unknown) => {
      calls.txUserCreate.push(args);
      return createdUserRow;
    },
  },
  auditLog: {
    create: async (args: unknown) => {
      calls.txAuditLogCreate.push(args);
    },
  },
};

Object.defineProperty(prisma, 'registrationLink', {
  value: {
    findUnique: async (args: unknown) => {
      calls.registrationLinkFindUnique.push(args);
      return linkRow;
    },
    delete: async (args: unknown) => {
      calls.registrationLinkDelete.push(args);
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: {
    findUnique: async (args: unknown) => {
      calls.userFindUnique.push(args);
      return existingUserRow;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'role', {
  value: {
    findUnique: async (args: unknown) => {
      calls.roleFindUnique.push(args);
      return employeeRoleRow;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'auditLog', {
  value: {
    create: async (args: unknown) => {
      calls.auditLogCreate.push(args);
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: ((tx: typeof txStub) => Promise<unknown>) | unknown[]) => {
    calls.transactions += 1;
    if (typeof fn === 'function') return fn(txStub);
    return Promise.all(fn);
  },
  configurable: true,
});

function makeLink(overrides: Partial<LinkRow> = {}): LinkRow {
  return {
    id: 'link1',
    tenantId: 't1',
    token: 'tok123',
    expiresAt: new Date(Date.now() + 60_000),
    createdBy: 'admin1',
    tenant: { name: 'Acme', status: 'Active' },
    ...overrides,
  };
}

beforeEach(() => {
  linkRow = null;
  existingUserRow = null;
  employeeRoleRow = { id: 'role1' };
  createdUserRow = { id: 'u1', name: '', email: '' };
  for (const arr of Object.values(calls)) {
    if (Array.isArray(arr)) arr.length = 0;
  }
  calls.transactions = 0;
});

describe('getLink', () => {
  it('returns null when no link exists for the tenant', async () => {
    linkRow = null;
    assert.equal(await getLink('t1'), null);
  });

  it('returns a non-expired dto for an active link', async () => {
    linkRow = makeLink({ expiresAt: new Date(Date.now() + 60_000) });
    const dto = await getLink('t1');
    assert.ok(dto);
    assert.equal(dto.expired, false);
    assert.match(dto.url, /\/join\/tok123$/);
  });

  it('marks a past-expiry link as expired', async () => {
    linkRow = makeLink({ expiresAt: new Date(Date.now() - 1000) });
    const dto = await getLink('t1');
    assert.ok(dto);
    assert.equal(dto.expired, true);
  });
});

describe('generateLink', () => {
  it('upserts a token scoped by tenantId and logs a generate audit entry', async () => {
    const dto = await generateLink('t1', 'admin1', 30);

    assert.equal(calls.transactions, 1);
    const upsertArgs = calls.registrationLinkUpsert[0] as { where: { tenantId: string }; create: Record<string, unknown> };
    assert.deepEqual(upsertArgs.where, { tenantId: 't1' });
    assert.equal(upsertArgs.create.tenantId, 't1');
    assert.equal(upsertArgs.create.createdBy, 'admin1');

    const auditArgs = calls.txAuditLogCreate[0] as { data: { tenantId: string; actorId: string; entity: string; action: string } };
    assert.equal(auditArgs.data.tenantId, 't1');
    assert.equal(auditArgs.data.actorId, 'admin1');
    assert.equal(auditArgs.data.entity, 'RegistrationLink');
    assert.equal(auditArgs.data.action, 'generate');

    assert.equal(dto.expired, false);
  });

  it('sets expiresAt roughly expiryMinutes from now', async () => {
    const before = Date.now();
    const dto = await generateLink('t1', 'admin1', 60);
    const expiresAt = new Date(dto.expiresAt).getTime();
    assert.ok(expiresAt >= before + 59 * 60 * 1000 && expiresAt <= before + 60 * 60 * 1000 + 1000);
  });
});

describe('revokeLink', () => {
  it('is a no-op when no link exists (idempotent, no transaction opened)', async () => {
    linkRow = null;
    await revokeLink('t1', 'admin1');
    assert.equal(calls.transactions, 0);
  });

  it('deletes the link and logs a revoke audit entry when one exists', async () => {
    linkRow = makeLink();
    await revokeLink('t1', 'admin1');

    assert.equal(calls.transactions, 1);
    assert.deepEqual(calls.registrationLinkDelete[0], { where: { tenantId: 't1' } });
    const auditArgs = calls.auditLogCreate[0] as { data: Record<string, unknown> };
    assert.equal(auditArgs.data.tenantId, 't1');
    assert.equal(auditArgs.data.actorId, 'admin1');
    assert.equal(auditArgs.data.entity, 'RegistrationLink');
    assert.equal(auditArgs.data.entityId, 'link1');
    assert.equal(auditArgs.data.action, 'revoke');
  });
});

describe('getPublicInfo (token validation)', () => {
  it('rejects a token with no matching link with 410', async () => {
    linkRow = null;
    await assert.rejects(getPublicInfo('missing-token'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 410);
      return true;
    });
  });

  it('rejects an expired link with 410', async () => {
    linkRow = makeLink({ expiresAt: new Date(Date.now() - 1000) });
    await assert.rejects(getPublicInfo('tok123'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 410);
      return true;
    });
  });

  it('rejects a link whose tenant is no longer Active with 410', async () => {
    linkRow = makeLink({ tenant: { name: 'Acme', status: 'Suspended' } });
    await assert.rejects(getPublicInfo('tok123'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 410);
      return true;
    });
  });

  it('returns the tenant name for a valid, unexpired, active-tenant link', async () => {
    linkRow = makeLink();
    const info = await getPublicInfo('tok123');
    assert.deepEqual(info, { tenantName: 'Acme' });
  });
});

describe('registerViaToken (public signup)', () => {
  beforeEach(() => {
    linkRow = makeLink();
  });

  it('rejects an invalid/expired token before checking for a duplicate email', async () => {
    linkRow = null;
    await assert.rejects(
      registerViaToken('missing-token', { name: 'Alice', email: 'alice@example.com', password: 'longenough1' }),
      (err: unknown) => err instanceof HttpError && err.status === 410,
    );
    assert.equal(calls.userFindUnique.length, 0);
  });

  it('rejects a duplicate email with 409 and does not open a transaction', async () => {
    existingUserRow = { id: 'existing', email: 'alice@example.com' };
    await assert.rejects(
      registerViaToken('tok123', { name: 'Alice', email: 'alice@example.com', password: 'longenough1' }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 409);
        assert.equal(err.message, 'This email is already registered.');
        return true;
      },
    );
    assert.equal(calls.transactions, 0);
  });

  it('rejects with 500 when the tenant has no Employee role configured', async () => {
    employeeRoleRow = null;
    await assert.rejects(
      registerViaToken('tok123', { name: 'Alice', email: 'alice@example.com', password: 'longenough1' }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 500);
        return true;
      },
    );
    assert.equal(calls.transactions, 0);
  });

  it('creates a Pending user with a hashed password, the Employee role, and no forced password change', async () => {
    createdUserRow = { id: 'newuser1', name: 'Alice', email: 'alice@example.com' };

    await registerViaToken('tok123', { name: 'Alice', email: 'alice@example.com', password: 'longenough1' });

    assert.equal(calls.transactions, 1);
    const createArgs = calls.txUserCreate[0] as { data: Record<string, unknown> };
    assert.equal(createArgs.data.tenantId, 't1');
    assert.equal(createArgs.data.name, 'Alice');
    assert.equal(createArgs.data.email, 'alice@example.com');
    assert.equal(createArgs.data.status, 'Pending');
    assert.equal(createArgs.data.mustChangePassword, false);
    assert.deepEqual(createArgs.data.roles, { create: [{ roleId: 'role1' }] });
    assert.ok(await argon2.verify(createArgs.data.passwordHash as string, 'longenough1'));

    const auditArgs = calls.txAuditLogCreate[0] as { data: Record<string, unknown> };
    assert.equal(auditArgs.data.tenantId, 't1');
    assert.equal(auditArgs.data.actorId, 'newuser1');
    assert.equal(auditArgs.data.entity, 'User');
    assert.equal(auditArgs.data.entityId, 'newuser1');
    assert.equal(auditArgs.data.action, 'self_register');
    assert.deepEqual(auditArgs.data.after, { name: 'Alice', email: 'alice@example.com', status: 'Pending' });
  });
});
