import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_DEPARTMENT_NAMES,
  SYSTEM_ROLE_KEYS,
  SYSTEM_ROLE_NAMES,
  SYSTEM_ROLE_PERMISSIONS,
  SystemRoleKey,
} from '@se/shared';
import { HARDWARE_ITEMS, SOFTWARE_ITEMS } from '../forms/core-forms.js';
import {
  currentLeavePeriod,
  grantEnterpriseAdminRole,
  initializeUserLeaveBalances,
  seedTenantEscalationDefaults,
  seedTenantItemCatalog,
  seedTenantLeaveTypes,
  seedTenantOrgDefaults,
} from './seed.service.js';

/**
 * Minimal fakes of the Prisma.TransactionClient subset each function actually calls
 * (escalation.service.test.ts pattern) — every seeder takes `tx` as a parameter rather than the
 * global `prisma` singleton, so no delegate-stubbing of the singleton is needed here.
 */

describe('seedTenantOrgDefaults', () => {
  it('upserts all 8 System roles with the fixed §4.4 permission bundle', async () => {
    const upsertCalls: unknown[] = [];
    const tx = {
      role: { upsert: async (args: unknown) => upsertCalls.push(args) },
      department: {
        findMany: async () => [],
        createMany: async () => undefined,
      },
    } as unknown as Prisma.TransactionClient;

    await seedTenantOrgDefaults(tx, 't1');

    assert.equal(upsertCalls.length, SYSTEM_ROLE_KEYS.length);
    for (const key of SYSTEM_ROLE_KEYS) {
      const call = upsertCalls.find((c) => (c as { where: { tenantId_key: { key: string } } }).where.tenantId_key.key === key) as
        | { where: unknown; update: unknown; create: unknown }
        | undefined;
      assert.ok(call, `expected an upsert for role ${key}`);
      assert.deepEqual(call.where, { tenantId_key: { tenantId: 't1', key } });
      assert.deepEqual(call.update, { isSystem: true, permissions: SYSTEM_ROLE_PERMISSIONS[key] });
      assert.deepEqual(call.create, {
        tenantId: 't1',
        key,
        name: SYSTEM_ROLE_NAMES[key],
        isSystem: true,
        permissions: SYSTEM_ROLE_PERMISSIONS[key],
      });
    }
  });

  it('creates only the default departments missing for the tenant', async () => {
    const createManyCalls: unknown[] = [];
    const tx = {
      role: { upsert: async () => undefined },
      department: {
        findMany: async () => [{ name: DEFAULT_DEPARTMENT_NAMES[0] }, { name: DEFAULT_DEPARTMENT_NAMES[1] }],
        createMany: async (args: unknown) => createManyCalls.push(args),
      },
    } as unknown as Prisma.TransactionClient;

    await seedTenantOrgDefaults(tx, 't1');

    assert.equal(createManyCalls.length, 1);
    const { data } = createManyCalls[0] as { data: Array<{ tenantId: string; name: string }> };
    assert.deepEqual(
      data.map((d) => d.name),
      DEFAULT_DEPARTMENT_NAMES.slice(2),
    );
    assert.ok(data.every((d) => d.tenantId === 't1'));
  });

  it('skips department createMany entirely when all defaults already exist', async () => {
    const createManyCalls: unknown[] = [];
    const tx = {
      role: { upsert: async () => undefined },
      department: {
        findMany: async () => DEFAULT_DEPARTMENT_NAMES.map((name) => ({ name })),
        createMany: async (args: unknown) => createManyCalls.push(args),
      },
    } as unknown as Prisma.TransactionClient;

    await seedTenantOrgDefaults(tx, 't1');

    assert.equal(createManyCalls.length, 0);
  });
});

describe('seedTenantEscalationDefaults', () => {
  function fakeTx(roles: Array<{ id: string; key: string }>) {
    const upsertCalls: Array<{ where: unknown; update: unknown; create: unknown }> = [];
    const tx = {
      role: { findMany: async () => roles },
      escalationRule: {
        upsert: async (args: { where: unknown; update: unknown; create: unknown }) => {
          upsertCalls.push(args);
        },
      },
    } as unknown as Prisma.TransactionClient;
    return { tx, upsertCalls };
  }

  it('upserts the full PRD default matrix when both target roles exist', async () => {
    const { tx, upsertCalls } = fakeTx([
      { id: 'role-hr', key: SystemRoleKey.HrHead },
      { id: 'role-ea', key: SystemRoleKey.EnterpriseAdmin },
    ]);

    await seedTenantEscalationDefaults(tx, 't1');

    assert.equal(upsertCalls.length, 3);
    assert.deepEqual(upsertCalls[0], {
      where: { tenantId_fromContext: { tenantId: 't1', fromContext: SystemRoleKey.ProjectManager } },
      update: {},
      create: { tenantId: 't1', fromContext: SystemRoleKey.ProjectManager, toRoleId: 'role-hr' },
    });
    assert.deepEqual(upsertCalls[1], {
      where: { tenantId_fromContext: { tenantId: 't1', fromContext: 'tech_lead' } },
      update: {},
      create: { tenantId: 't1', fromContext: 'tech_lead', toRoleId: 'role-hr' },
    });
    assert.deepEqual(upsertCalls[2], {
      where: { tenantId_fromContext: { tenantId: 't1', fromContext: SystemRoleKey.HrHead } },
      update: {},
      create: { tenantId: 't1', fromContext: SystemRoleKey.HrHead, toRoleId: 'role-ea' },
    });
  });

  it('skips a default rule whose target role does not exist for the tenant', async () => {
    const { tx, upsertCalls } = fakeTx([{ id: 'role-hr', key: SystemRoleKey.HrHead }]);

    await seedTenantEscalationDefaults(tx, 't1');

    // Only the two rules escalating *to* hr-head can resolve; hr-head -> enterprise-admin is skipped.
    assert.equal(upsertCalls.length, 2);
    assert.ok(upsertCalls.every((c) => (c.create as { toRoleId: string }).toRoleId === 'role-hr'));
  });

  it('upserts nothing when the tenant has none of the required System roles', async () => {
    const { tx, upsertCalls } = fakeTx([]);

    await seedTenantEscalationDefaults(tx, 't1');

    assert.equal(upsertCalls.length, 0);
  });
});

describe('seedTenantLeaveTypes', () => {
  it('creates all 5 default leave types when none exist yet', async () => {
    const createCalls: unknown[] = [];
    const tx = {
      leaveType: {
        findFirst: async () => null,
        create: async (args: unknown) => createCalls.push(args),
      },
    } as unknown as Prisma.TransactionClient;

    await seedTenantLeaveTypes(tx, 't1');

    assert.equal(createCalls.length, 5);
    const names = createCalls.map((c) => (c as { data: { name: string } }).data.name);
    assert.deepEqual(names, [
      'Leaves available',
      'LWP',
      'Becoming a father',
      'Becoming a mother',
      'Getting married',
    ]);
  });

  it('skips a leave type that already exists for the tenant, by name', async () => {
    const createCalls: unknown[] = [];
    const tx = {
      leaveType: {
        findFirst: async (args: { where: { name: string } }) => (args.where.name === 'LWP' ? { id: 'existing' } : null),
        create: async (args: unknown) => createCalls.push(args),
      },
    } as unknown as Prisma.TransactionClient;

    await seedTenantLeaveTypes(tx, 't1');

    assert.equal(createCalls.length, 4);
    assert.ok(!createCalls.some((c) => (c as { data: { name: string } }).data.name === 'LWP'));
  });
});

describe('currentLeavePeriod', () => {
  it('returns the current calendar year (IST) as a 4-digit string', () => {
    const period = currentLeavePeriod();
    assert.match(period, /^\d{4}$/);
  });
});

describe('initializeUserLeaveBalances', () => {
  it('creates a balance row at the full quota for every paid leave type, for the current period', async () => {
    const upsertCalls: unknown[] = [];
    const tx = {
      leaveType: {
        findMany: async () => [
          { id: 'lt-1', quota: 18 },
          { id: 'lt-2', quota: 5 },
        ],
      },
      leaveBalance: {
        upsert: async (args: unknown) => upsertCalls.push(args),
      },
    } as unknown as Prisma.TransactionClient;

    await initializeUserLeaveBalances(tx, 't1', 'u1');

    const period = currentLeavePeriod();
    assert.equal(upsertCalls.length, 2);
    assert.deepEqual(upsertCalls[0], {
      where: { userId_leaveTypeId_period: { userId: 'u1', leaveTypeId: 'lt-1', period } },
      update: {},
      create: { userId: 'u1', leaveTypeId: 'lt-1', period, balance: 18 },
    });
    assert.deepEqual(upsertCalls[1], {
      where: { userId_leaveTypeId_period: { userId: 'u1', leaveTypeId: 'lt-2', period } },
      update: {},
      create: { userId: 'u1', leaveTypeId: 'lt-2', period, balance: 5 },
    });
  });

  it('queries only isPaid leave types, scoped to the tenant', async () => {
    let findManyArgs: unknown;
    const tx = {
      leaveType: {
        findMany: async (args: unknown) => {
          findManyArgs = args;
          return [];
        },
      },
      leaveBalance: { upsert: async () => undefined },
    } as unknown as Prisma.TransactionClient;

    await initializeUserLeaveBalances(tx, 't1', 'u1');

    assert.deepEqual(findManyArgs, { where: { tenantId: 't1', isPaid: true }, select: { id: true, quota: true } });
  });
});

describe('seedTenantItemCatalog', () => {
  it('upserts one row per software and hardware catalog item', async () => {
    const upsertCalls: unknown[] = [];
    const tx = {
      itemCatalog: {
        upsert: async (args: unknown) => upsertCalls.push(args),
      },
    } as unknown as Prisma.TransactionClient;

    await seedTenantItemCatalog(tx, 't1');

    assert.equal(upsertCalls.length, SOFTWARE_ITEMS.length + HARDWARE_ITEMS.length);
    assert.deepEqual(upsertCalls[0], {
      where: { tenantId_type_name: { tenantId: 't1', type: 'software', name: SOFTWARE_ITEMS[0] } },
      update: {},
      create: { tenantId: 't1', type: 'software', name: SOFTWARE_ITEMS[0] },
    });
    const lastHardware = HARDWARE_ITEMS[HARDWARE_ITEMS.length - 1];
    assert.deepEqual(upsertCalls[upsertCalls.length - 1], {
      where: { tenantId_type_name: { tenantId: 't1', type: 'hardware', name: lastHardware } },
      update: {},
      create: { tenantId: 't1', type: 'hardware', name: lastHardware },
    });
  });
});

describe('grantEnterpriseAdminRole', () => {
  it('upserts the UserRole join row for the tenant Enterprise Admin role', async () => {
    let userRoleArgs: unknown;
    const tx = {
      role: {
        findUniqueOrThrow: async (args: { where: { tenantId_key: { tenantId: string; key: string } } }) => {
          assert.deepEqual(args.where.tenantId_key, { tenantId: 't1', key: SystemRoleKey.EnterpriseAdmin });
          return { id: 'role-ea' };
        },
      },
      userRole: {
        upsert: async (args: unknown) => {
          userRoleArgs = args;
        },
      },
    } as unknown as Prisma.TransactionClient;

    await grantEnterpriseAdminRole(tx, 't1', 'u1');

    assert.deepEqual(userRoleArgs, {
      where: { userId_roleId: { userId: 'u1', roleId: 'role-ea' } },
      update: {},
      create: { userId: 'u1', roleId: 'role-ea' },
    });
  });

  it('propagates the not-found error when the tenant has no Enterprise Admin role row', async () => {
    const tx = {
      role: {
        findUniqueOrThrow: async () => {
          throw new Error('No Role found');
        },
      },
      userRole: { upsert: async () => undefined },
    } as unknown as Prisma.TransactionClient;

    await assert.rejects(grantEnterpriseAdminRole(tx, 't1', 'u1'), /No Role found/);
  });
});
