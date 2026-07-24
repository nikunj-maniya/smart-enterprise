import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { adjustLeaveBalance } from './leave-balance-ledger.js';

let leaveTypeRow: { id: string; isPaid: boolean } | null;
let queryRawArgs: unknown[];
let queryRawResult: Array<{ id: string; balance: number }>;
let leaveBalanceUpdateArgs: Array<{ where: unknown; data: Record<string, unknown> }>;

function fakeTx(): Prisma.TransactionClient {
  return {
    leaveType: { findFirst: async () => leaveTypeRow },
    leaveBalance: {
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        leaveBalanceUpdateArgs.push(args);
        return { id: 'lb1', ...args.data };
      },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queryRawArgs.push(values);
      return queryRawResult;
    },
  } as unknown as Prisma.TransactionClient;
}

beforeEach(() => {
  leaveTypeRow = { id: 'lt-1', isPaid: true };
  queryRawArgs = [];
  queryRawResult = [{ id: 'lb-1', balance: 10 }];
  leaveBalanceUpdateArgs = [];
});

test('adjustLeaveBalance is a no-op when leaveTypeName is null (non-leave form / no leave type submitted)', async () => {
  await adjustLeaveBalance(fakeTx(), 't1', 'user-1', null, 3, 0, -1);
  assert.equal(leaveBalanceUpdateArgs.length, 0);
});

test('adjustLeaveBalance is a no-op when totalDays is null', async () => {
  await adjustLeaveBalance(fakeTx(), 't1', 'user-1', 'Casual Leave', null, 0, -1);
  assert.equal(leaveBalanceUpdateArgs.length, 0);
});

test('adjustLeaveBalance is a no-op when totalDays is 0 (falsy)', async () => {
  await adjustLeaveBalance(fakeTx(), 't1', 'user-1', 'Casual Leave', 0, 0, -1);
  assert.equal(leaveBalanceUpdateArgs.length, 0);
});

test('adjustLeaveBalance is a no-op when the leave type cannot be resolved by name', async () => {
  leaveTypeRow = null;
  await adjustLeaveBalance(fakeTx(), 't1', 'user-1', 'Ghost Type', 3, 0, -1);
  assert.equal(leaveBalanceUpdateArgs.length, 0);
});

test('adjustLeaveBalance is a no-op for an unpaid (LWP) leave type', async () => {
  leaveTypeRow = { id: 'lt-lwp', isPaid: false };
  await adjustLeaveBalance(fakeTx(), 't1', 'user-1', 'LWP', 3, 0, -1);
  assert.equal(leaveBalanceUpdateArgs.length, 0);
});

test('adjustLeaveBalance is a no-op when there is no balance row to lock', async () => {
  queryRawResult = [];
  await adjustLeaveBalance(fakeTx(), 't1', 'user-1', 'Casual Leave', 3, 0, -1);
  assert.equal(leaveBalanceUpdateArgs.length, 0);
});

test('adjustLeaveBalance deducts full days with no half-days (sign -1)', async () => {
  await adjustLeaveBalance(fakeTx(), 't1', 'user-1', 'Casual Leave', 3, 0, -1);
  assert.equal(leaveBalanceUpdateArgs.length, 1);
  assert.equal(leaveBalanceUpdateArgs[0].data.balance, 7); // 10 - 3
  assert.deepEqual(leaveBalanceUpdateArgs[0].where, { id: 'lb-1' });
});

test('adjustLeaveBalance treats null halfDayCount the same as 0', async () => {
  await adjustLeaveBalance(fakeTx(), 't1', 'user-1', 'Casual Leave', 3, null, -1);
  assert.equal(leaveBalanceUpdateArgs[0].data.balance, 7);
});

test('adjustLeaveBalance deducts half-days at 0.5 each: effectiveDays = totalDays - 0.5 * halfDayCount', async () => {
  await adjustLeaveBalance(fakeTx(), 't1', 'user-1', 'Casual Leave', 3, 1, -1);
  assert.equal(leaveBalanceUpdateArgs[0].data.balance, 7.5); // 10 - (3 - 0.5)
});

test('adjustLeaveBalance credits days back on restore (sign +1)', async () => {
  await adjustLeaveBalance(fakeTx(), 't1', 'user-1', 'Casual Leave', 3, 1, 1);
  assert.equal(leaveBalanceUpdateArgs[0].data.balance, 12.5); // 10 + 2.5
});

test('adjustLeaveBalance is a no-op when every day requested is a half-day and would net to <= 0 effective days', async () => {
  // totalDays=1, halfDayCount=2 -> effectiveDays = 1 - 1 = 0, guarded off before touching the balance.
  await adjustLeaveBalance(fakeTx(), 't1', 'user-1', 'Casual Leave', 1, 2, -1);
  assert.equal(leaveBalanceUpdateArgs.length, 0);
});

test('adjustLeaveBalance locks the balance row scoped to the requester, leave type, and current period', async () => {
  await adjustLeaveBalance(fakeTx(), 't1', 'user-42', 'Casual Leave', 2, 0, -1);
  assert.equal(queryRawArgs.length, 1);
  const [userId, leaveTypeId, period] = queryRawArgs[0] as [string, string, string];
  assert.equal(userId, 'user-42');
  assert.equal(leaveTypeId, 'lt-1');
  assert.match(period, /^\d{4}$/); // calendar-year period string, e.g. "2026"
});
