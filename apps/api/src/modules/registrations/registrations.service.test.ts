import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RegistrationStatus, TenantStatus, UserStatus } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import {
  acceptRegistration,
  listRegistrations,
  rejectRegistration,
  submitRegistration,
} from './registrations.service.js';

/**
 * Stubbed-Prisma suite (enterprises.service.test.ts / departments.service.test.ts pattern):
 * PrismaClient exposes its delegates via a proxy `get` trap, so `mock.method` can't see them —
 * redefine every delegate this service (and the `getSettings()` helper it calls) reads or writes
 * as an in-memory stub, reset in `beforeEach`. `prisma.$transaction` invokes its callback with a
 * `tx` backed by the same stubs.
 *
 * `acceptRegistration`'s happy path also runs the org-masters/forms seeding pipeline (roles,
 * departments, escalation rules, leave types, item catalog, core forms, leave balances) inside the
 * same transaction — that pipeline has its own dedicated coverage in
 * org-masters/seed.service.test.ts and forms.service.test.ts, so only the pre-transaction guards
 * (404/409) are exercised here to avoid re-stubbing that entire surface.
 */

type SettingsRow = {
  forcePasswordChangeOnFirstLogin: boolean;
  allowPublicRegistration: boolean;
  notifyOnNewRegistration: boolean;
};

let settingsRow: SettingsRow = {
  forcePasswordChangeOnFirstLogin: true,
  allowPublicRegistration: true,
  notifyOnNewRegistration: true,
};
let existingUserByEmail: { status: UserStatus } | null = null;
let adminRows: { id: string }[] = [];
let existingReg: {
  id: string;
  tenantId: string;
  userId: string;
  status: RegistrationStatus;
} | null = null;
let registrationRows: unknown[] = [];
let registrationTotal = 0;

const calls = {
  platformSettingsUpsert: [] as unknown[],
  userFindUnique: [] as unknown[],
  enterpriseRegistrationFindUnique: [] as unknown[],
  enterpriseRegistrationFindMany: [] as unknown[],
  enterpriseRegistrationCount: [] as unknown[],
  transactions: 0,
  txTenantCreate: [] as unknown[],
  txUserCreate: [] as unknown[],
  txEnterpriseRegistrationCreate: [] as unknown[],
  txUserFindMany: [] as unknown[],
  txNotificationCreateMany: [] as unknown[],
  txTenantUpdate: [] as unknown[],
  txUserUpdate: [] as unknown[],
  txEnterpriseRegistrationUpdate: [] as unknown[],
  txAuditLogCreate: [] as unknown[],
};

const txStub = {
  tenant: {
    create: async (args: unknown) => {
      calls.txTenantCreate.push(args);
      return { id: 't-new' };
    },
    update: async (args: unknown) => {
      calls.txTenantUpdate.push(args);
    },
  },
  user: {
    create: async (args: unknown) => {
      calls.txUserCreate.push(args);
      return { id: 'u-new' };
    },
    update: async (args: unknown) => {
      calls.txUserUpdate.push(args);
    },
    findMany: async (args: unknown) => {
      calls.txUserFindMany.push(args);
      return adminRows;
    },
  },
  enterpriseRegistration: {
    create: async (args: unknown) => {
      calls.txEnterpriseRegistrationCreate.push(args);
      return { id: 'reg-new' };
    },
    update: async (args: unknown) => {
      calls.txEnterpriseRegistrationUpdate.push(args);
      return {
        id: existingReg?.id ?? 'reg-new',
        companyName: 'Acme',
        contactName: 'Alice',
        contactEmail: 'alice@acme.com',
        size: null,
        industry: null,
        website: null,
        status: (args as { data: { status: RegistrationStatus } }).data.status,
        reviewNote: (args as { data: { reviewNote?: string } }).data.reviewNote ?? null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
    },
  },
  notification: {
    createMany: async (args: unknown) => {
      calls.txNotificationCreateMany.push(args);
    },
  },
  auditLog: {
    create: async (args: unknown) => {
      calls.txAuditLogCreate.push(args);
    },
  },
};

Object.defineProperty(prisma, 'platformSettings', {
  value: {
    upsert: async (args: unknown) => {
      calls.platformSettingsUpsert.push(args);
      return settingsRow;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: {
    findUnique: async (args: unknown) => {
      calls.userFindUnique.push(args);
      return existingUserByEmail;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'enterpriseRegistration', {
  value: {
    findUnique: async (args: unknown) => {
      calls.enterpriseRegistrationFindUnique.push(args);
      return existingReg;
    },
    findMany: async (args: unknown) => {
      calls.enterpriseRegistrationFindMany.push(args);
      return registrationRows;
    },
    count: async (args: unknown) => {
      calls.enterpriseRegistrationCount.push(args);
      return registrationTotal;
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

function regRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r1',
    companyName: 'Acme',
    contactName: 'Alice',
    contactEmail: 'alice@acme.com',
    size: '1-10',
    industry: 'Tech',
    website: null,
    status: RegistrationStatus.Pending,
    reviewNote: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const submitInput = {
  companyName: 'Acme',
  industry: 'Tech',
  size: '1-10',
  contactName: 'Alice',
  contactEmail: 'alice@acme.com',
  password: 'password123',
};

beforeEach(() => {
  settingsRow = {
    forcePasswordChangeOnFirstLogin: true,
    allowPublicRegistration: true,
    notifyOnNewRegistration: true,
  };
  existingUserByEmail = null;
  adminRows = [];
  existingReg = null;
  registrationRows = [];
  registrationTotal = 0;
  for (const arr of Object.values(calls)) {
    if (Array.isArray(arr)) arr.length = 0;
  }
  calls.transactions = 0;
});

describe('submitRegistration', () => {
  it('rejects with 403 when public registration is disabled', async () => {
    settingsRow = { ...settingsRow, allowPublicRegistration: false };

    await assert.rejects(submitRegistration(submitInput), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 403);
      assert.equal(err.message, 'Public enterprise registration is currently disabled.');
      return true;
    });
    assert.equal(calls.transactions, 0);
  });

  it('rejects with 409 when the email belongs to a previously rejected user', async () => {
    existingUserByEmail = { status: UserStatus.Inactive };

    await assert.rejects(submitRegistration(submitInput), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 409);
      assert.equal(err.message, 'This email was previously rejected and cannot be used again.');
      return true;
    });
  });

  it('rejects with 409 when the email is already registered (any other status)', async () => {
    existingUserByEmail = { status: UserStatus.Active };

    await assert.rejects(submitRegistration(submitInput), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 409);
      assert.equal(err.message, 'This email is already registered.');
      return true;
    });
  });

  it('creates the tenant, user, and registration inside a transaction, and notifies admins', async () => {
    adminRows = [{ id: 'admin1' }, { id: 'admin2' }];

    const result = await submitRegistration(submitInput);

    assert.equal(result.id, 'reg-new');
    assert.equal(calls.transactions, 1);
    assert.deepEqual((calls.txTenantCreate[0] as { data: unknown }).data, {
      name: 'Acme',
      industry: 'Tech',
      size: '1-10',
      website: undefined,
      status: TenantStatus.Pending,
    });
    assert.equal((calls.txUserCreate[0] as { data: { tenantId: string; status: UserStatus } }).data.tenantId, 't-new');
    assert.equal((calls.txUserCreate[0] as { data: { status: UserStatus } }).data.status, UserStatus.Pending);
    assert.equal(
      (calls.txEnterpriseRegistrationCreate[0] as { data: { status: RegistrationStatus } }).data.status,
      RegistrationStatus.Pending,
    );
    assert.equal(calls.txNotificationCreateMany.length, 1);
    const notifyArgs = calls.txNotificationCreateMany[0] as { data: Array<{ userId: string }> };
    assert.deepEqual(
      notifyArgs.data.map((d) => d.userId),
      ['admin1', 'admin2'],
    );
  });

  it('skips notifications entirely when notifyOnNewRegistration is off', async () => {
    settingsRow = { ...settingsRow, notifyOnNewRegistration: false };
    adminRows = [{ id: 'admin1' }];

    await submitRegistration(submitInput);

    assert.equal(calls.txUserFindMany.length, 0);
    assert.equal(calls.txNotificationCreateMany.length, 0);
  });

  it('skips notifications when no system admins exist, even with the setting on', async () => {
    adminRows = [];

    await submitRegistration(submitInput);

    assert.equal(calls.txUserFindMany.length, 1);
    assert.equal(calls.txNotificationCreateMany.length, 0);
  });
});

describe('listRegistrations', () => {
  it('applies a status filter and search across company/contact fields, with pagination', async () => {
    registrationRows = [regRow()];
    registrationTotal = 1;

    const res = await listRegistrations({
      page: 2,
      pageSize: 10,
      search: 'acme',
      status: RegistrationStatus.Pending,
    });

    assert.deepEqual(calls.enterpriseRegistrationFindMany[0], {
      where: {
        status: RegistrationStatus.Pending,
        OR: [
          { companyName: { contains: 'acme', mode: 'insensitive' } },
          { contactName: { contains: 'acme', mode: 'insensitive' } },
          { contactEmail: { contains: 'acme', mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    assert.equal(res.rows[0].createdAt, '2026-01-01T00:00:00.000Z');
    assert.equal(res.total, 1);
  });

  it('omits status and search from the where clause when not provided', async () => {
    await listRegistrations({ page: 1, pageSize: 20 });

    assert.deepEqual((calls.enterpriseRegistrationFindMany[0] as { where: unknown }).where, {});
  });
});

describe('acceptRegistration guards', () => {
  it('throws 404 when the registration does not exist', async () => {
    existingReg = null;
    await assert.rejects(
      acceptRegistration('missing', 'actor1'),
      (err: unknown) => err instanceof HttpError && err.status === 404 && err.message === 'Registration not found',
    );
    assert.equal(calls.transactions, 0);
  });

  it('throws 409 when the registration has already been reviewed', async () => {
    existingReg = { id: 'r1', tenantId: 't1', userId: 'u1', status: RegistrationStatus.Accepted };
    await assert.rejects(
      acceptRegistration('r1', 'actor1'),
      (err: unknown) =>
        err instanceof HttpError && err.status === 409 && err.message === 'Registration has already been reviewed',
    );
    assert.equal(calls.transactions, 0);
  });
});

describe('rejectRegistration', () => {
  it('throws 404 when the registration does not exist', async () => {
    existingReg = null;
    await assert.rejects(
      rejectRegistration('missing', 'actor1', 'not a fit'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('throws 409 when the registration has already been reviewed', async () => {
    existingReg = { id: 'r1', tenantId: 't1', userId: 'u1', status: RegistrationStatus.Rejected };
    await assert.rejects(
      rejectRegistration('r1', 'actor1', 'not a fit'),
      (err: unknown) => err instanceof HttpError && err.status === 409,
    );
    assert.equal(calls.transactions, 0);
  });

  it('rejects the tenant/user and records the reviewer + reason on the registration', async () => {
    existingReg = { id: 'r1', tenantId: 't1', userId: 'u1', status: RegistrationStatus.Pending };

    const dto = await rejectRegistration('r1', 'actor1', 'Not a good fit');

    assert.deepEqual((calls.txTenantUpdate[0] as { where: unknown; data: unknown }).where, { id: 't1' });
    assert.deepEqual((calls.txTenantUpdate[0] as { data: unknown }).data, { status: TenantStatus.Rejected });
    assert.deepEqual((calls.txUserUpdate[0] as { where: unknown; data: unknown }).where, { id: 'u1' });
    assert.deepEqual((calls.txUserUpdate[0] as { data: unknown }).data, { status: UserStatus.Inactive });
    assert.deepEqual((calls.txEnterpriseRegistrationUpdate[0] as { data: unknown }).data, {
      status: RegistrationStatus.Rejected,
      reviewedBy: 'actor1',
      reviewNote: 'Not a good fit',
    });
    const { data } = calls.txAuditLogCreate[0] as { data: Record<string, unknown> };
    assert.equal(data.entity, 'Tenant');
    assert.equal(data.entityId, 't1');
    assert.deepEqual(data.before, { status: TenantStatus.Pending });
    assert.deepEqual(data.after, { status: TenantStatus.Rejected, reason: 'Not a good fit' });
    assert.equal(dto.status, RegistrationStatus.Rejected);
    assert.equal(dto.reviewNote, 'Not a good fit');
  });
});
