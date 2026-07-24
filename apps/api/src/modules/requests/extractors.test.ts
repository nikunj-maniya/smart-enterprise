import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { extractPromotedColumns, requiresBalanceRestore, restoreBalanceOnCancel } from './extractors.js';

// ── extractPromotedColumns — pure per-form-key extractors ──────────────────

test('extractPromotedColumns returns no columns for an unknown/unregistered form key', () => {
  assert.deepEqual(extractPromotedColumns('it', { anything: 'here' }), {});
});

test('extractLeave (via extractPromotedColumns) maps every promoted field from a well-formed leave payload', () => {
  const result = extractPromotedColumns('leave', {
    start_date: '2026-02-01',
    end_date: '2026-02-03',
    number_of_days: 3,
    half_day_dates: ['2026-02-02'],
    leave_type: 'Casual Leave',
    department: 'dept-1',
    project_name: ['proj-1', 'proj-2'],
  });

  assert.deepEqual(result, {
    startDate: new Date('2026-02-01'),
    endDate: new Date('2026-02-03'),
    totalDays: 3,
    halfDayCount: 1,
    leaveTypeId: 'Casual Leave',
    departmentId: 'dept-1',
    projectId: 'proj-1', // first pick of a multi-select project picker wins
  });
});

test('extractLeave leaves every field undefined for missing/malformed input', () => {
  const result = extractPromotedColumns('leave', {
    start_date: 123, // wrong type
    number_of_days: '3', // wrong type
    half_day_dates: 'not-an-array',
    project_name: 'not-an-array',
  });

  assert.deepEqual(result, {
    startDate: undefined,
    endDate: undefined,
    totalDays: undefined,
    halfDayCount: undefined,
    leaveTypeId: undefined,
    departmentId: undefined,
    projectId: undefined,
  });
});

test('extractLeave treats an empty half_day_dates array as a zero count, not "unset"', () => {
  const result = extractPromotedColumns('leave', { half_day_dates: [] });
  assert.equal(result.halfDayCount, 0);
});

test('extractWfh derives totalDays (inclusive) from the date range instead of trusting a submitted count', () => {
  const result = extractPromotedColumns('wfh', {
    start_date: '2026-03-01',
    end_date: '2026-03-01',
    department: 'dept-2',
    project_name: ['proj-9'],
  });

  assert.equal(result.totalDays, 1); // same-day WFH is 1 day, inclusive
  assert.deepEqual(result.startDate, new Date('2026-03-01'));
  assert.deepEqual(result.endDate, new Date('2026-03-01'));
  assert.equal(result.departmentId, 'dept-2');
  assert.equal(result.projectId, 'proj-9');
});

test('extractWfh spanning multiple days counts every day inclusively', () => {
  const result = extractPromotedColumns('wfh', { start_date: '2026-03-01', end_date: '2026-03-03' });
  assert.equal(result.totalDays, 3);
});

test('extractWfh leaves totalDays undefined when either date is missing', () => {
  assert.equal(extractPromotedColumns('wfh', { start_date: '2026-03-01' }).totalDays, undefined);
  assert.equal(extractPromotedColumns('wfh', { end_date: '2026-03-01' }).totalDays, undefined);
  assert.equal(extractPromotedColumns('wfh', {}).totalDays, undefined);
});

test('extractWfh has no leaveTypeId field at all (WFH never carries a leave type)', () => {
  const result = extractPromotedColumns('wfh', { start_date: '2026-03-01', end_date: '2026-03-01' });
  assert.equal('leaveTypeId' in result, false);
});

test('extractVisitor promotes visit_datetime to startDate only', () => {
  const result = extractPromotedColumns('visitor', { visit_datetime: '2026-04-01T09:00:00.000Z', privacy_consent: true });
  assert.deepEqual(result, { startDate: new Date('2026-04-01T09:00:00.000Z') });
});

test('extractVisitor leaves startDate undefined when visit_datetime is missing or malformed', () => {
  assert.deepEqual(extractPromotedColumns('visitor', {}), { startDate: undefined });
  assert.deepEqual(extractPromotedColumns('visitor', { visit_datetime: 12345 }), { startDate: undefined });
});

// ── requiresBalanceRestore ──────────────────────────────────────────────────

test('requiresBalanceRestore is true only for leave, never for wfh/visitor/it/unknown', () => {
  assert.equal(requiresBalanceRestore('leave'), true);
  assert.equal(requiresBalanceRestore('wfh'), false);
  assert.equal(requiresBalanceRestore('visitor'), false);
  assert.equal(requiresBalanceRestore('it'), false);
  assert.equal(requiresBalanceRestore('unknown-form'), false);
});

// ── restoreBalanceOnCancel — thin passthrough to adjustLeaveBalance(sign: +1) ───────────────

let leaveTypeRow: { id: string; isPaid: boolean } | null;
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
    $queryRaw: async () => queryRawResult,
  } as unknown as Prisma.TransactionClient;
}

beforeEach(() => {
  leaveTypeRow = { id: 'lt-1', isPaid: true };
  queryRawResult = [{ id: 'lb-1', balance: 4 }];
  leaveBalanceUpdateArgs = [];
});

test('restoreBalanceOnCancel credits back the previously-deducted days', async () => {
  await restoreBalanceOnCancel(fakeTx(), {
    tenantId: 't1',
    requestId: 'req-1',
    requesterId: 'requester-1',
    formKey: 'leave',
    leaveTypeId: 'Casual Leave',
    totalDays: 3,
    halfDayCount: 1,
  });

  assert.equal(leaveBalanceUpdateArgs.length, 1);
  // effectiveDays = 3 - 0.5*1 = 2.5; credited back (sign +1): 4 + 2.5 = 6.5.
  assert.equal(leaveBalanceUpdateArgs[0].data.balance, 6.5);
});

test('restoreBalanceOnCancel is a no-op when leaveTypeId/totalDays are absent', async () => {
  await restoreBalanceOnCancel(fakeTx(), {
    tenantId: 't1',
    requestId: 'req-1',
    requesterId: 'requester-1',
    formKey: 'leave',
    leaveTypeId: null,
    totalDays: null,
    halfDayCount: null,
  });
  assert.equal(leaveBalanceUpdateArgs.length, 0);
});
