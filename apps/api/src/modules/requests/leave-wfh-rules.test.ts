import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import type { ResolvedApprover } from './approver-resolution.js';
import {
  assertHalfDayDatesInRange,
  assertHrSignoffPresentWhenRequired,
  computeOverBalance,
  computeSpecialConditionFlag,
} from './leave-wfh-rules.js';

// ── assertHrSignoffPresentWhenRequired ──────────────────────────────────────

test('assertHrSignoffPresentWhenRequired is a no-op for a form key it does not govern', () => {
  assertHrSignoffPresentWhenRequired('visitor', { start_date: '2026-01-01', end_date: '2026-01-10' }, []);
});

test('assertHrSignoffPresentWhenRequired is a no-op when the dates are missing/malformed (cannot compute a span)', () => {
  assertHrSignoffPresentWhenRequired('leave', { start_date: 'not-a-date', end_date: '2026-01-10' }, []);
  assertHrSignoffPresentWhenRequired('leave', {}, []);
});

test('assertHrSignoffPresentWhenRequired allows a <=2 day span with no HR sign-off', () => {
  assertHrSignoffPresentWhenRequired('leave', { start_date: '2026-01-01', end_date: '2026-01-02' }, []);
});

test('assertHrSignoffPresentWhenRequired throws when a >2 day span has no HR Head approver stage (leave)', () => {
  assert.throws(
    () => assertHrSignoffPresentWhenRequired('leave', { start_date: '2026-01-01', end_date: '2026-01-05' }, []),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('assertHrSignoffPresentWhenRequired throws for a >2 day WFH span too, independent of the client-submitted duration radio', () => {
  // The client's own `duration` field claims "short", but the actual dates span 4 days —
  // this is the server-side re-check that must not trust that client value.
  assert.throws(
    () => assertHrSignoffPresentWhenRequired('wfh', { start_date: '2026-01-01', end_date: '2026-01-04', duration: 'short' }, []),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('assertHrSignoffPresentWhenRequired passes when an hr-head approver stage is present for a >2 day span', () => {
  const approvers: ResolvedApprover[] = [{ approverId: 'hr-1', roleContext: 'hr-head' }];
  assertHrSignoffPresentWhenRequired('leave', { start_date: '2026-01-01', end_date: '2026-01-05' }, approvers);
});

test('assertHrSignoffPresentWhenRequired treats exactly 2 days as not requiring sign-off (boundary)', () => {
  // 2026-01-01 to 2026-01-02 inclusive = 2 days; only STRICTLY more than 2 requires sign-off.
  assertHrSignoffPresentWhenRequired('leave', { start_date: '2026-01-01', end_date: '2026-01-02' }, []);
});

test('assertHrSignoffPresentWhenRequired requires sign-off starting at 3 days (boundary)', () => {
  assert.throws(
    () => assertHrSignoffPresentWhenRequired('leave', { start_date: '2026-01-01', end_date: '2026-01-03' }, []),
    (err: unknown) => err instanceof HttpError,
  );
});

// ── assertHalfDayDatesInRange ────────────────────────────────────────────────

test('assertHalfDayDatesInRange is a no-op for a form key it does not govern', () => {
  assertHalfDayDatesInRange('visitor', { half_day_dates: ['2026-01-01'] });
});

test('assertHalfDayDatesInRange is a no-op when no half-days were selected', () => {
  assertHalfDayDatesInRange('leave', {});
  assertHalfDayDatesInRange('leave', { half_day_dates: [] });
});

test('assertHalfDayDatesInRange is a no-op when start/end dates are missing (nothing to validate against)', () => {
  assertHalfDayDatesInRange('leave', { half_day_dates: ['2026-01-02'] });
});

test('assertHalfDayDatesInRange passes when every half-day falls within [start_date, end_date]', () => {
  assertHalfDayDatesInRange('leave', {
    start_date: '2026-01-01',
    end_date: '2026-01-05',
    half_day_dates: ['2026-01-01', '2026-01-05'],
  });
});

test('assertHalfDayDatesInRange throws when a half-day falls before start_date', () => {
  assert.throws(
    () =>
      assertHalfDayDatesInRange('leave', { start_date: '2026-01-03', end_date: '2026-01-05', half_day_dates: ['2026-01-01'] }),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('assertHalfDayDatesInRange throws when a half-day falls after end_date', () => {
  assert.throws(
    () =>
      assertHalfDayDatesInRange('leave', { start_date: '2026-01-01', end_date: '2026-01-03', half_day_dates: ['2026-01-05'] }),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('assertHalfDayDatesInRange throws when a half-day entry is malformed (non-string)', () => {
  assert.throws(
    () =>
      assertHalfDayDatesInRange('leave', { start_date: '2026-01-01', end_date: '2026-01-05', half_day_dates: [12345] }),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('assertHalfDayDatesInRange also governs wfh via half_wfh_dates', () => {
  assertHalfDayDatesInRange('wfh', { start_date: '2026-01-01', end_date: '2026-01-05', half_wfh_dates: ['2026-01-02'] });
  assert.throws(
    () =>
      assertHalfDayDatesInRange('wfh', { start_date: '2026-01-01', end_date: '2026-01-05', half_wfh_dates: ['2026-01-09'] }),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

// ── computeOverBalance / computeSpecialConditionFlag — prisma singleton reads ───────────────

let leaveTypeRow: { id: string; isPaid: boolean } | null;
let leaveBalanceRow: { balance: number } | null;
let leaveBalanceFindUniqueArgs: unknown[];
let requestCount: number;
let requestCountArgs: unknown[];

Object.defineProperty(prisma, 'leaveType', {
  value: { findFirst: async () => leaveTypeRow },
  configurable: true,
});
Object.defineProperty(prisma, 'leaveBalance', {
  value: {
    findUnique: async (args: unknown) => {
      leaveBalanceFindUniqueArgs.push(args);
      return leaveBalanceRow;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'request', {
  value: {
    count: async (args: unknown) => {
      requestCountArgs.push(args);
      return requestCount;
    },
  },
  configurable: true,
});

beforeEach(() => {
  leaveTypeRow = { id: 'lt-1', isPaid: true };
  leaveBalanceRow = { balance: 5 };
  leaveBalanceFindUniqueArgs = [];
  requestCount = 0;
  requestCountArgs = [];
});

test('computeOverBalance returns null for a non-leave form', async () => {
  assert.equal(await computeOverBalance('t1', 'u1', 'wfh', 3, 'Casual Leave'), null);
});

test('computeOverBalance returns null when leaveTypeName is undefined', async () => {
  assert.equal(await computeOverBalance('t1', 'u1', 'leave', 3, undefined), null);
});

test('computeOverBalance returns null when totalDays is undefined', async () => {
  assert.equal(await computeOverBalance('t1', 'u1', 'leave', undefined, 'Casual Leave'), null);
});

test('computeOverBalance returns false when the leave type cannot be resolved', async () => {
  leaveTypeRow = null;
  assert.equal(await computeOverBalance('t1', 'u1', 'leave', 5, 'Ghost Type'), false);
});

test('computeOverBalance returns false for an unpaid (LWP) leave type — never over-balance', async () => {
  leaveTypeRow = { id: 'lt-lwp', isPaid: false };
  assert.equal(await computeOverBalance('t1', 'u1', 'leave', 999, 'LWP'), false);
});

test('computeOverBalance returns true when requested days exceed the remaining balance', async () => {
  leaveBalanceRow = { balance: 2 };
  assert.equal(await computeOverBalance('t1', 'u1', 'leave', 3, 'Casual Leave'), true);
});

test('computeOverBalance returns false when requested days are within the remaining balance', async () => {
  leaveBalanceRow = { balance: 5 };
  assert.equal(await computeOverBalance('t1', 'u1', 'leave', 3, 'Casual Leave'), false);
});

test('computeOverBalance treats a missing balance row as zero remaining', async () => {
  leaveBalanceRow = null;
  assert.equal(await computeOverBalance('t1', 'u1', 'leave', 1, 'Casual Leave'), true);
});

test('computeOverBalance treats an exact match (requested === remaining) as NOT over balance (boundary)', async () => {
  leaveBalanceRow = { balance: 3 };
  assert.equal(await computeOverBalance('t1', 'u1', 'leave', 3, 'Casual Leave'), false);
});

test('computeSpecialConditionFlag returns null for a non-wfh form', async () => {
  assert.equal(await computeSpecialConditionFlag('t1', 'u1', 'leave', { special_condition: 'Yes' }), null);
});

test('computeSpecialConditionFlag returns false when special_condition was not claimed', async () => {
  assert.equal(await computeSpecialConditionFlag('t1', 'u1', 'wfh', {}), false);
  assert.equal(await computeSpecialConditionFlag('t1', 'u1', 'wfh', { special_condition: 'No' }), false);
});

test('computeSpecialConditionFlag returns false on a first-time claim (no prior claims)', async () => {
  requestCount = 0;
  assert.equal(await computeSpecialConditionFlag('t1', 'u1', 'wfh', { special_condition: 'Yes' }), false);
});

test('computeSpecialConditionFlag returns true when the requester has claimed special-condition before', async () => {
  requestCount = 1;
  assert.equal(await computeSpecialConditionFlag('t1', 'u1', 'wfh', { special_condition: 'Yes' }), true);
  assert.deepEqual(requestCountArgs[0], {
    where: { tenantId: 't1', requesterId: 'u1', form: { key: 'wfh' }, payload: { path: ['special_condition'], equals: 'Yes' } },
  });
});
