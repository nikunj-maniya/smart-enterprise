import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { currentLeavePeriod } from '../org-masters/seed.service.js';
import {
  createLeaveType,
  deleteLeaveType,
  getAbsenceCap,
  listLeaveTypes,
  updateAbsenceCap,
  updateLeaveType,
} from './leave-types.service.js';

/**
 * Stubbed-Prisma unit tests (item-catalog.service.test.ts pattern): CI has no live Postgres, so
 * the `leaveType`, `request`, `user`, `leaveBalance`, and `tenant` delegates are redefined as
 * in-memory stubs, plus `$transaction` runs the callback against a stub `tx` exposing the same
 * delegates plus `auditLog`.
 */

type LeaveTypeRow = { id: string; tenantId: string; name: string; quota: number; isPaid: boolean; accrualRule: unknown };
type BalanceRow = { userId: string; leaveTypeId: string; period: string; balance: number };

let leaveTypeRows: LeaveTypeRow[] = [];
let activeUsers: { id: string }[] = [];
let balanceRows: BalanceRow[] = [];
let requestCountByName: Record<string, number> = {};
let tenantSettings: Record<string, unknown> | null = null;
let nextId = 1;
const auditLogs: unknown[] = [];

Object.defineProperty(prisma, 'leaveType', {
  value: {
    findMany: async ({ where }: { where: { tenantId: string } }) =>
      [...leaveTypeRows].filter((r) => r.tenantId === where.tenantId).sort((a, b) => a.name.localeCompare(b.name)),
    findFirst: async (args: { where: { tenantId?: string; name?: { equals: string; mode: string }; NOT?: { id: string }; id?: string } }) => {
      const { where } = args;
      const row = leaveTypeRows.find((r) => {
        if (where.tenantId !== undefined && r.tenantId !== where.tenantId) return false;
        if (where.id !== undefined && r.id !== where.id) return false;
        if (where.name && r.name.toLowerCase() !== where.name.equals.toLowerCase()) return false;
        if (where.NOT && r.id === where.NOT.id) return false;
        return true;
      });
      return row ? { ...row } : null;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'request', {
  value: {
    count: async ({ where }: { where: { leaveTypeId: string } }) => requestCountByName[where.leaveTypeId] ?? 0,
  },
  configurable: true,
});
Object.defineProperty(prisma, 'tenant', {
  value: {
    findUniqueOrThrow: async () => ({ settings: tenantSettings }),
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      leaveType: {
        create: async ({ data }: { data: Omit<LeaveTypeRow, 'id'> }) => {
          const row: LeaveTypeRow = { id: `lt${nextId++}`, ...data };
          leaveTypeRows.push(row);
          return row;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<LeaveTypeRow> }) => {
          const row = leaveTypeRows.find((r) => r.id === where.id)!;
          Object.assign(row, data);
          return row;
        },
        delete: async ({ where }: { where: { id: string } }) => {
          leaveTypeRows = leaveTypeRows.filter((r) => r.id !== where.id);
        },
      },
      user: {
        findMany: async () => activeUsers,
      },
      leaveBalance: {
        createMany: async ({ data }: { data: BalanceRow[] }) => {
          balanceRows.push(...data);
        },
        updateMany: async ({ where, data }: { where: { leaveTypeId: string }; data: { balance: { increment: number } } }) => {
          for (const b of balanceRows) {
            if (b.leaveTypeId === where.leaveTypeId) b.balance += data.balance.increment;
          }
        },
        upsert: async ({
          where,
          create,
        }: {
          where: { userId_leaveTypeId_period: { userId: string; leaveTypeId: string; period: string } };
          update: unknown;
          create: BalanceRow;
        }) => {
          const key = where.userId_leaveTypeId_period;
          const existing = balanceRows.find(
            (b) => b.userId === key.userId && b.leaveTypeId === key.leaveTypeId && b.period === key.period,
          );
          if (!existing) balanceRows.push(create);
        },
        deleteMany: async ({ where }: { where: { leaveTypeId: string } }) => {
          balanceRows = balanceRows.filter((b) => b.leaveTypeId !== where.leaveTypeId);
        },
      },
      tenant: {
        update: async () => {},
      },
      auditLog: { create: async ({ data }: { data: unknown }) => void auditLogs.push(data) },
    }),
  configurable: true,
});

beforeEach(() => {
  leaveTypeRows = [];
  activeUsers = [];
  balanceRows = [];
  requestCountByName = {};
  tenantSettings = null;
  nextId = 1;
  auditLogs.length = 0;
});

describe('listLeaveTypes', () => {
  it('maps accrualRule JSON into carryForward/halfDayAllowed, defaulting both false when absent', async () => {
    leaveTypeRows = [
      { id: 'lt1', tenantId: 't1', name: 'Casual Leave', quota: 12, isPaid: true, accrualRule: { carryForward: true, halfDayAllowed: true } },
      { id: 'lt2', tenantId: 't1', name: 'LWP', quota: 0, isPaid: false, accrualRule: null },
    ];

    const dtos = await listLeaveTypes('t1');

    assert.deepEqual(dtos[0], { id: 'lt1', name: 'Casual Leave', quota: 12, isPaid: true, carryForward: true, halfDayAllowed: true });
    assert.deepEqual(dtos[1], { id: 'lt2', name: 'LWP', quota: 0, isPaid: false, carryForward: false, halfDayAllowed: false });
  });
});

describe('createLeaveType', () => {
  it('rejects a case-insensitive duplicate name with 409', async () => {
    leaveTypeRows = [{ id: 'lt1', tenantId: 't1', name: 'Casual Leave', quota: 12, isPaid: true, accrualRule: null }];

    await assert.rejects(
      createLeaveType('t1', 'actor-1', { name: 'casual leave', quota: 10, isPaid: true, carryForward: false, halfDayAllowed: false }),
      (err: unknown) => err instanceof HttpError && err.status === 409,
    );
  });

  it('creates a paid type and seeds a balance row at quota for every active user, audit-logged', async () => {
    activeUsers = [{ id: 'u1' }, { id: 'u2' }];

    const dto = await createLeaveType('t1', 'actor-1', { name: 'Comp Off', quota: 4, isPaid: true, carryForward: false, halfDayAllowed: true });

    assert.equal(dto.name, 'Comp Off');
    assert.equal(balanceRows.length, 2);
    assert.ok(balanceRows.every((b) => b.leaveTypeId === dto.id && b.balance === 4 && b.period === currentLeavePeriod()));
    assert.deepEqual(auditLogs[0], {
      tenantId: 't1',
      actorId: 'actor-1',
      entity: 'LeaveType',
      entityId: dto.id,
      action: 'create',
      after: { name: 'Comp Off', quota: 4, isPaid: true, carryForward: false, halfDayAllowed: true },
    });
  });

  it('creates an unpaid type without seeding any balance rows', async () => {
    activeUsers = [{ id: 'u1' }];

    await createLeaveType('t1', 'actor-1', { name: 'LWP', quota: 0, isPaid: false, carryForward: false, halfDayAllowed: false });

    assert.equal(balanceRows.length, 0);
  });
});

describe('updateLeaveType', () => {
  it('rejects an unknown id with 404', async () => {
    await assert.rejects(
      updateLeaveType('t1', 'actor-1', 'missing', { quota: 10, carryForward: false, halfDayAllowed: false }),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('blocks a rename while requests reference the current name, with a 409 naming the count', async () => {
    leaveTypeRows = [{ id: 'lt1', tenantId: 't1', name: 'Casual Leave', quota: 12, isPaid: true, accrualRule: null }];
    requestCountByName['Casual Leave'] = 2;

    await assert.rejects(
      updateLeaveType('t1', 'actor-1', 'lt1', { name: 'CL', quota: 12, carryForward: false, halfDayAllowed: false }),
      (err: unknown) => err instanceof HttpError && err.status === 409 && /2 leave request/.test(err.message),
    );
  });

  it('allows a rename to an available name when no requests reference the old one', async () => {
    leaveTypeRows = [{ id: 'lt1', tenantId: 't1', name: 'Casual Leave', quota: 12, isPaid: true, accrualRule: null }];
    requestCountByName['Casual Leave'] = 0;

    const dto = await updateLeaveType('t1', 'actor-1', 'lt1', { name: 'CL', quota: 12, carryForward: false, halfDayAllowed: false });

    assert.equal(dto.name, 'CL');
  });

  it('adjusts existing balances by the quota delta rather than resetting them', async () => {
    leaveTypeRows = [{ id: 'lt1', tenantId: 't1', name: 'Casual Leave', quota: 12, isPaid: true, accrualRule: null }];
    balanceRows = [{ userId: 'u1', leaveTypeId: 'lt1', period: '2026', balance: 9 }];

    await updateLeaveType('t1', 'actor-1', 'lt1', { quota: 15, carryForward: false, halfDayAllowed: false });

    assert.equal(balanceRows[0].balance, 12); // 9 + (15 - 12)
  });

  it('seeds balance rows for active users when flipping a type from unpaid to paid', async () => {
    leaveTypeRows = [{ id: 'lt1', tenantId: 't1', name: 'Sabbatical', quota: 5, isPaid: false, accrualRule: null }];
    activeUsers = [{ id: 'u1' }];

    await updateLeaveType('t1', 'actor-1', 'lt1', { isPaid: true, quota: 5, carryForward: false, halfDayAllowed: false });

    assert.equal(balanceRows.length, 1);
    assert.equal(balanceRows[0].balance, 5);
  });

  it('audit-logs the before/after accrual state', async () => {
    leaveTypeRows = [
      { id: 'lt1', tenantId: 't1', name: 'Casual Leave', quota: 12, isPaid: true, accrualRule: { carryForward: false, halfDayAllowed: false } },
    ];

    await updateLeaveType('t1', 'actor-1', 'lt1', { quota: 12, carryForward: true, halfDayAllowed: true });

    assert.deepEqual(auditLogs[0], {
      tenantId: 't1',
      actorId: 'actor-1',
      entity: 'LeaveType',
      entityId: 'lt1',
      action: 'update',
      before: { name: 'Casual Leave', quota: 12, isPaid: true, accrualRule: { carryForward: false, halfDayAllowed: false } },
      after: { name: 'Casual Leave', quota: 12, isPaid: true, carryForward: true, halfDayAllowed: true },
    });
  });
});

describe('deleteLeaveType', () => {
  it('rejects an unknown id with 404', async () => {
    await assert.rejects(
      deleteLeaveType('t1', 'actor-1', 'missing'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('refuses to delete a type in use, with a 409 naming the referencing count', async () => {
    leaveTypeRows = [{ id: 'lt1', tenantId: 't1', name: 'Casual Leave', quota: 12, isPaid: true, accrualRule: null }];
    requestCountByName['Casual Leave'] = 3;

    await assert.rejects(
      deleteLeaveType('t1', 'actor-1', 'lt1'),
      (err: unknown) => err instanceof HttpError && err.status === 409 && /3 leave request/.test(err.message),
    );
    assert.equal(leaveTypeRows.length, 1);
  });

  it('deletes an unused type along with its zero-usage balance rows, audit-logged', async () => {
    leaveTypeRows = [{ id: 'lt1', tenantId: 't1', name: 'Casual Leave', quota: 12, isPaid: true, accrualRule: null }];
    balanceRows = [{ userId: 'u1', leaveTypeId: 'lt1', period: '2026', balance: 12 }];
    requestCountByName['Casual Leave'] = 0;

    await deleteLeaveType('t1', 'actor-1', 'lt1');

    assert.equal(leaveTypeRows.length, 0);
    assert.equal(balanceRows.length, 0);
    assert.deepEqual(auditLogs[0], {
      tenantId: 't1',
      actorId: 'actor-1',
      entity: 'LeaveType',
      entityId: 'lt1',
      action: 'delete',
      before: { name: 'Casual Leave', quota: 12, isPaid: true, accrualRule: null },
    });
  });
});

describe('getAbsenceCap / updateAbsenceCap', () => {
  it('defaults to a cap of 3 when the tenant has no configured cap', async () => {
    assert.deepEqual(await getAbsenceCap('t1'), { cap: 3 });
  });

  it('reads the tenant-configured cap when set', async () => {
    tenantSettings = { concurrentAbsenceCap: 7 };
    assert.deepEqual(await getAbsenceCap('t1'), { cap: 7 });
  });

  it('updates the cap and audit-logs the prior (default) value', async () => {
    const dto = await updateAbsenceCap('t1', 'actor-1', { cap: 5 });

    assert.deepEqual(dto, { cap: 5 });
    assert.deepEqual(auditLogs[0], {
      tenantId: 't1',
      actorId: 'actor-1',
      entity: 'Tenant',
      entityId: 't1',
      action: 'update-absence-cap',
      before: { cap: 3 },
      after: { cap: 5 },
    });
  });
});
