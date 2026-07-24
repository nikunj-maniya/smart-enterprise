import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { redisConnection } from '../../lib/redis.js';
import { decideOnRequest } from './decisions.service.js';

// decisions.service.js transitively imports the BullMQ `redisConnection` (via
// notifications.service.js -> slack-delivery.js), which connects eagerly (no lazyConnect) and
// retries indefinitely — left alone, that keeps this process alive with no live Redis in CI.
// Silence its connection errors and disconnect immediately (front-desk.service.test.ts pattern).
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * Full-transaction stub (auto-complete-requests.job.test.ts / escalation-sweep.job.test.ts
 * pattern): `decideOnRequest` does everything inside its own `prisma.$transaction`, so the whole
 * fake `tx` graph — including the real `applyDeclaredTransition` (transitions.service.js) and
 * `adjustLeaveBalance` (leave-balance-ledger.js) it calls internally — is exercised here rather
 * than mocked away. Every recipient's `notificationPreferences` disables the `slack` channel for
 * the toggled types this flow can emit (`request_approved`/`request_rejected`/
 * `request_decision_update`) so `notify()` never reaches `mirrorToSlack` -> BullMQ; `inApp`
 * defaults to enabled (no override), so `notification.create` still runs and is assertable.
 */

const STATUS_MODEL = {
  states: ['Pending Approval', 'Approved', 'Rejected', 'Withdrawn'],
  transitions: [
    { from: 'Pending Approval', to: 'Approved', roles: ['tech-lead'] },
    { from: 'Pending Approval', to: 'Rejected', roles: ['tech-lead'] },
    { from: 'Pending Approval', to: 'Withdrawn', roles: ['requester'] },
  ],
};

// Visitor's status model has no declared `Rejected` transition at all — a rejection resolves to
// `Cancelled` instead (decisions.service.js's `resolveRejectOutcomeState`).
const VISITOR_STATUS_MODEL = {
  states: ['Pending Approval', 'Approved', 'Cancelled'],
  transitions: [
    { from: 'Pending Approval', to: 'Approved', roles: ['process-head'] },
    { from: 'Pending Approval', to: 'Cancelled', roles: ['process-head'] },
  ],
};

const NO_SLACK = {
  request_approved: { slack: false },
  request_rejected: { slack: false },
  request_decision_update: { slack: false },
};

function fakeUser(name: string) {
  return { name, notificationPreferences: NO_SLACK };
}

type ApproverRow = { id: string; approverId: string; decision: string };
type RequestRow = {
  id: string;
  tenantId: string;
  requesterId: string;
  status: string;
  leaveTypeId: string | null;
  totalDays: number | null;
  halfDayCount: number | null;
  createdAt: Date;
  form: { key: string; title: string; statusModel: unknown };
  approvers: ApproverRow[];
};

function baseRequest(overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'req-1',
    tenantId: 't1',
    requesterId: 'requester-1',
    status: 'Pending Approval',
    leaveTypeId: null,
    totalDays: null,
    halfDayCount: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    form: { key: 'wfh', title: 'WFH Request', statusModel: STATUS_MODEL },
    approvers: [{ id: 'ra-1', approverId: 'approver-1', decision: 'pending' }],
    ...overrides,
  };
}

let requestRow: RequestRow | null;
let freshApproversResult: ApproverRow[];
let usersById: Record<string, { name: string; notificationPreferences: unknown }>;
let decisionUpdateCount: number;
let requestUpdateManyCount: number;
let leaveTypeRow: { id: string; isPaid: boolean } | null;
let queryRawResult: Array<{ id: string; balance: number }>;

let approverUpdateManyArgs: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>;
let requestUpdateManyArgs: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>;
let requestStatusHistoryCreateArgs: unknown[];
let auditLogCreateArgs: unknown[];
let notificationCreateArgs: Array<{ data: Record<string, unknown> }>;
let leaveBalanceUpdateArgs: Array<{ where: unknown; data: Record<string, unknown> }>;

Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      request: {
        findFirst: async () => requestRow,
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          requestUpdateManyArgs.push(args);
          return { count: requestUpdateManyCount };
        },
        findUniqueOrThrow: async () => ({
          id: requestRow!.id,
          status: (requestUpdateManyArgs.at(-1)?.data.status as string | undefined) ?? requestRow!.status,
          createdAt: requestRow!.createdAt,
        }),
      },
      requestApprover: {
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          approverUpdateManyArgs.push(args);
          // The "record my own decision" call is keyed by `id`; `reconcileRemainingApprovers`'s
          // call is keyed by `requestId` only — only the former is subject to the optimistic-lock
          // race simulated via `decisionUpdateCount`.
          return { count: 'id' in args.where ? decisionUpdateCount : 1 };
        },
        findMany: async () => freshApproversResult,
      },
      auditLog: { create: async (args: unknown) => { auditLogCreateArgs.push(args); } },
      user: {
        findUniqueOrThrow: async (args: { where: { id: string } }) => usersById[args.where.id],
        findUnique: async (args: { where: { id: string } }) => usersById[args.where.id] ?? null,
      },
      notification: {
        create: async (args: { data: Record<string, unknown> }) => {
          notificationCreateArgs.push(args);
          return { id: 'n1', ...args.data, createdAt: new Date() };
        },
      },
      requestStatusHistory: { create: async (args: unknown) => { requestStatusHistoryCreateArgs.push(args); } },
      leaveType: { findFirst: async () => leaveTypeRow },
      leaveBalance: {
        update: async (args: { where: unknown; data: Record<string, unknown> }) => {
          leaveBalanceUpdateArgs.push(args);
          return { id: 'lb1', ...args.data };
        },
      },
      $queryRaw: async () => queryRawResult,
    }),
  configurable: true,
});

beforeEach(() => {
  requestRow = baseRequest();
  freshApproversResult = [{ id: 'ra-1', approverId: 'approver-1', decision: 'approved' }];
  usersById = {
    'requester-1': fakeUser('Requester One'),
    'approver-1': fakeUser('Approver One'),
    'approver-2': fakeUser('Approver Two'),
  };
  decisionUpdateCount = 1;
  requestUpdateManyCount = 1;
  leaveTypeRow = null;
  queryRawResult = [];
  approverUpdateManyArgs = [];
  requestUpdateManyArgs = [];
  requestStatusHistoryCreateArgs = [];
  auditLogCreateArgs = [];
  notificationCreateArgs = [];
  leaveBalanceUpdateArgs = [];
});

// ── Reject-comment validation (before the transaction even opens) ──────────

test('decideOnRequest rejects a rejection with no comment', async () => {
  await assert.rejects(
    decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'rejected', undefined),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('decideOnRequest rejects a rejection whose comment is only whitespace', async () => {
  await assert.rejects(
    decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'rejected', '   '),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

// ── Guard clauses inside the transaction ───────────────────────────────────

test('decideOnRequest throws 404 when the request does not exist', async () => {
  requestRow = null;
  await assert.rejects(
    decideOnRequest('t1', 'missing', { id: 'approver-1' }, 'approved', undefined),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
});

test('decideOnRequest throws 403 when the actor is not a snapshotted approver', async () => {
  await assert.rejects(
    decideOnRequest('t1', 'req-1', { id: 'stranger' }, 'approved', undefined),
    (err: unknown) => err instanceof HttpError && err.status === 403,
  );
});

test('decideOnRequest throws 409 when the approver has already decided', async () => {
  requestRow = baseRequest({ approvers: [{ id: 'ra-1', approverId: 'approver-1', decision: 'approved' }] });
  await assert.rejects(
    decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'approved', undefined),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );
});

test('decideOnRequest throws 409 when the request has moved off a decidable status', async () => {
  // No transition is declared out of "Withdrawn" for a non-requester/non-system role.
  requestRow = baseRequest({ status: 'Withdrawn' });
  await assert.rejects(
    decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'approved', undefined),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );
});

test('decideOnRequest throws 409 on a concurrent double-decision race (optimistic write hits 0 rows)', async () => {
  decisionUpdateCount = 0;
  await assert.rejects(
    decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'approved', undefined),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );
});

// ── Approve: still-pending (partial approval) branch ───────────────────────

test('decideOnRequest, partial approval: notifies remaining peers and the requester, but does not transition the request', async () => {
  requestRow = baseRequest({
    approvers: [
      { id: 'ra-1', approverId: 'approver-1', decision: 'pending' },
      { id: 'ra-2', approverId: 'approver-2', decision: 'pending' },
    ],
  });
  freshApproversResult = [
    { id: 'ra-1', approverId: 'approver-1', decision: 'approved' },
    { id: 'ra-2', approverId: 'approver-2', decision: 'pending' },
  ];

  const result = await decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'approved', undefined);

  assert.equal(requestUpdateManyArgs.length, 0);
  assert.equal(requestStatusHistoryCreateArgs.length, 0);
  assert.equal(leaveBalanceUpdateArgs.length, 0);

  assert.equal(notificationCreateArgs.length, 2);
  const peerNotif = notificationCreateArgs.find((c) => c.data.type === 'approval_peer_decided');
  assert.equal(peerNotif?.data.userId, 'approver-2');
  const requesterNotif = notificationCreateArgs.find((c) => c.data.type === 'request_decision_update');
  assert.equal(requesterNotif?.data.userId, 'requester-1');

  assert.equal(result.status, 'Pending Approval');
});

test('decideOnRequest, partial approval: skips the peer notification entirely when no peer is left pending', async () => {
  freshApproversResult = [{ id: 'ra-1', approverId: 'approver-1', decision: 'approved' }, { id: 'ra-2', approverId: 'approver-2', decision: 'rejected' }];
  requestRow = baseRequest({
    approvers: [
      { id: 'ra-1', approverId: 'approver-1', decision: 'pending' },
      { id: 'ra-2', approverId: 'approver-2', decision: 'rejected' },
    ],
  });

  await decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'approved', undefined);

  assert.equal(notificationCreateArgs.some((c) => c.data.type === 'approval_peer_decided'), false);
});

// ── Approve: final-decision branch ──────────────────────────────────────────

test('decideOnRequest, final approval on a non-leave form: applies the Approved transition without touching the leave balance', async () => {
  const result = await decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'approved', undefined);

  assert.equal(leaveBalanceUpdateArgs.length, 0);
  assert.equal(requestUpdateManyArgs.length, 1);
  assert.equal(requestUpdateManyArgs[0].data.status, 'Approved');
  assert.equal(requestStatusHistoryCreateArgs.length, 1);
  // One audit row for the decision itself, one for the resulting transition.
  assert.equal(auditLogCreateArgs.length, 2);

  const approvedNotif = notificationCreateArgs.find((c) => c.data.type === 'request_approved');
  assert.equal(approvedNotif?.data.userId, 'requester-1');
  assert.equal(result.status, 'Approved');
});

test('decideOnRequest, final approval on a leave form: deducts the leave balance before applying the Approved transition', async () => {
  requestRow = baseRequest({
    form: { key: 'leave', title: 'Leave Request', statusModel: STATUS_MODEL },
    leaveTypeId: 'Casual Leave',
    totalDays: 3,
    halfDayCount: 1,
  });
  leaveTypeRow = { id: 'lt-1', isPaid: true };
  queryRawResult = [{ id: 'lb-1', balance: 10 }];

  await decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'approved', undefined);

  assert.equal(leaveBalanceUpdateArgs.length, 1);
  // effectiveDays = totalDays - 0.5 * halfDayCount = 3 - 0.5 = 2.5; deducted (sign -1).
  assert.equal(leaveBalanceUpdateArgs[0].data.balance, 7.5);
  assert.equal(requestUpdateManyArgs[0].data.status, 'Approved');
});

test('decideOnRequest, final approval on a leave form with an unpaid (LWP) leave type: skips the balance deduction', async () => {
  requestRow = baseRequest({
    form: { key: 'leave', title: 'Leave Request', statusModel: STATUS_MODEL },
    leaveTypeId: 'LWP',
    totalDays: 2,
    halfDayCount: 0,
  });
  leaveTypeRow = { id: 'lt-2', isPaid: false };

  await decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'approved', undefined);

  assert.equal(leaveBalanceUpdateArgs.length, 0);
  assert.equal(requestUpdateManyArgs[0].data.status, 'Approved');
});

// ── Reject branch ────────────────────────────────────────────────────────

test('decideOnRequest, rejection: applies the declared Rejected transition, reconciles remaining pending approvers, and records the reason', async () => {
  requestRow = baseRequest({
    approvers: [
      { id: 'ra-1', approverId: 'approver-1', decision: 'pending' },
      { id: 'ra-2', approverId: 'approver-2', decision: 'pending' },
    ],
  });
  freshApproversResult = [
    { id: 'ra-1', approverId: 'approver-1', decision: 'rejected' },
    { id: 'ra-2', approverId: 'approver-2', decision: 'pending' },
  ];

  const result = await decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'rejected', 'Not enough coverage');

  assert.equal(requestUpdateManyArgs[0].data.status, 'Rejected');

  const reconcileCall = approverUpdateManyArgs.find((c) => !('id' in c.where));
  assert.ok(reconcileCall);
  assert.deepEqual(reconcileCall!.where, { requestId: 'req-1', decision: 'pending' });
  assert.equal(reconcileCall!.data.decision, 'rejected');

  const decisionCall = approverUpdateManyArgs.find((c) => 'id' in c.where);
  assert.equal(decisionCall!.data.comment, 'Not enough coverage');

  const rejectedNotif = notificationCreateArgs.find((c) => c.data.type === 'request_rejected');
  assert.equal(rejectedNotif?.data.userId, 'requester-1');
  assert.equal((rejectedNotif!.data.payload as { reason?: string }).reason, 'Not enough coverage');

  assert.equal(result.status, 'Rejected');
});

test('decideOnRequest, rejection: falls back to "Cancelled" when the form has no declared Rejected transition (Visitor)', async () => {
  requestRow = baseRequest({ form: { key: 'visitor', title: 'Visitor Registration', statusModel: VISITOR_STATUS_MODEL } });

  const result = await decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'rejected', 'Not expected');

  assert.equal(requestUpdateManyArgs[0].data.status, 'Cancelled');
  assert.equal(result.status, 'Cancelled');
});

test('decideOnRequest, rejection: never touches the leave balance even on a leave form', async () => {
  requestRow = baseRequest({
    form: { key: 'leave', title: 'Leave Request', statusModel: STATUS_MODEL },
    leaveTypeId: 'Casual Leave',
    totalDays: 3,
    halfDayCount: 0,
  });
  leaveTypeRow = { id: 'lt-1', isPaid: true };
  queryRawResult = [{ id: 'lb-1', balance: 10 }];

  await decideOnRequest('t1', 'req-1', { id: 'approver-1' }, 'rejected', 'No');

  assert.equal(leaveBalanceUpdateArgs.length, 0);
});
