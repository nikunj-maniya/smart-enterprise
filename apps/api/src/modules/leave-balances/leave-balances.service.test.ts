import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { getMyLeaveBalances } from './leave-balances.service.js';

/**
 * Stubbed-Prisma unit tests (forms.service.test.ts pattern): CI has no live Postgres, so the
 * `leaveBalance` delegate is redefined as an in-memory stub.
 */

type BalanceRow = { balance: number; leaveType: { id: string; name: string; quota: number } };

let rows: BalanceRow[] = [];
const findManyArgs: unknown[] = [];

Object.defineProperty(prisma, 'leaveBalance', {
  value: {
    findMany: async (args: unknown) => {
      findManyArgs.push(args);
      return rows;
    },
  },
  configurable: true,
});

beforeEach(() => {
  rows = [];
  findManyArgs.length = 0;
});

describe('getMyLeaveBalances', () => {
  it('derives used as quota minus the current balance', async () => {
    rows = [{ balance: 9, leaveType: { id: 'lt1', name: 'Casual Leave', quota: 12 } }];

    const dtos = await getMyLeaveBalances('t1', 'u1');

    assert.deepEqual(dtos, [{ leaveTypeId: 'lt1', leaveTypeName: 'Casual Leave', used: 3, total: 12 }]);
  });

  it('clamps used to 0 rather than going negative when balance exceeds the current quota', async () => {
    // e.g. the admin lowered the quota mid-year after some balance was already carried/credited.
    rows = [{ balance: 15, leaveType: { id: 'lt1', name: 'Casual Leave', quota: 12 } }];

    const dtos = await getMyLeaveBalances('t1', 'u1');

    assert.equal(dtos[0].used, 0);
  });

  it('returns an empty list when the user has no balance rows for the period', async () => {
    rows = [];
    assert.deepEqual(await getMyLeaveBalances('t1', 'u1'), []);
  });

  it('scopes the query by userId, the current-year period, and the leave type\'s tenant, ordered by type name', async () => {
    await getMyLeaveBalances('t1', 'u1');

    const args = findManyArgs[0] as { where: { userId: string; period: string; leaveType: { tenantId: string } }; orderBy: unknown };
    assert.equal(args.where.userId, 'u1');
    assert.equal(args.where.leaveType.tenantId, 't1');
    assert.match(args.where.period, /^\d{4}$/);
    assert.deepEqual(args.orderBy, { leaveType: { name: 'asc' } });
  });

  it('maps multiple leave types independently', async () => {
    rows = [
      { balance: 5, leaveType: { id: 'lt1', name: 'Casual Leave', quota: 12 } },
      { balance: 0, leaveType: { id: 'lt2', name: 'Sick Leave', quota: 6 } },
    ];

    const dtos = await getMyLeaveBalances('t1', 'u1');

    assert.deepEqual(dtos, [
      { leaveTypeId: 'lt1', leaveTypeName: 'Casual Leave', used: 7, total: 12 },
      { leaveTypeId: 'lt2', leaveTypeName: 'Sick Leave', used: 6, total: 6 },
    ]);
  });
});
