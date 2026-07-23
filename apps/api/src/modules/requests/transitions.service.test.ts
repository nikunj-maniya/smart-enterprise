import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { redisConnection } from '../../lib/redis.js';
import {
  applyDeclaredTransition,
  systemTransitionRequest,
  transitionRequest,
  type RequestWithForm,
} from './transitions.service.js';

// transitions.service.js transitively imports the BullMQ `redisConnection` (via
// notifications.service.js -> slack-delivery.js), which connects eagerly (no lazyConnect) and
// retries indefinitely — left alone, that keeps this process alive with no live Redis in CI.
// Silence its connection errors and disconnect immediately (front-desk.service.test.ts pattern).
redisConnection.on('error', () => {});
redisConnection.disconnect();

const STATUS_MODEL = {
  states: ['Pending Approval', 'Approved', 'Cancelled', 'Withdrawn'],
  transitions: [
    { from: 'Pending Approval', to: 'Withdrawn', roles: ['requester'] },
    { from: 'Approved', to: 'Cancelled', roles: ['hr-head'] },
    { from: 'Approved', to: 'Completed', roles: ['system'] },
  ],
};

const VISITOR_STATUS_MODEL = {
  states: ['Approved', 'Checked-In', 'Checked-Out'],
  transitions: [
    { from: 'Approved', to: 'Checked-In', roles: ['process-head'] },
    { from: 'Checked-In', to: 'Checked-Out', roles: ['process-head'] },
  ],
};

const IT_STATUS_MODEL = {
  states: ['Pending Approval', 'Fulfilled'],
  transitions: [{ from: 'Pending Approval', to: 'Fulfilled', roles: ['it-admin'] }],
};

function baseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'req-1',
    tenantId: 't1',
    requesterId: 'requester-1',
    status: 'Pending Approval',
    leaveTypeId: null,
    totalDays: null,
    halfDayCount: null,
    itAssigneeId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    form: { key: 'wfh', title: 'WFH Request', statusModel: STATUS_MODEL },
    approvers: [],
    ...overrides,
  };
}

// ── `applyDeclaredTransition` — direct fake-`tx` unit tests (escalation.service.test.ts pattern:
// the function itself takes `tx` as a parameter, so no need to stub the `prisma` singleton). ────

interface TxState {
  requestUpdateManyArgs: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>;
  requestUpdateManyCount: number;
  statusHistoryCreateArgs: unknown[];
  auditLogCreateArgs: unknown[];
  approverUpdateManyArgs: unknown[];
  notificationCreateArgs: Array<{ data: Record<string, unknown> }>;
  visitorUpdateArgs: Array<{ where: unknown; data: Record<string, unknown> }>;
  leaveTypeRow: { id: string; isPaid: boolean } | null;
  queryRawResult: Array<{ id: string; balance: number }>;
  leaveBalanceUpdateArgs: Array<{ where: unknown; data: Record<string, unknown> }>;
  usersById: Record<string, { name: string; notificationPreferences: unknown }>;
}

function freshState(): TxState {
  return {
    requestUpdateManyArgs: [],
    requestUpdateManyCount: 1,
    statusHistoryCreateArgs: [],
    auditLogCreateArgs: [],
    approverUpdateManyArgs: [],
    notificationCreateArgs: [],
    visitorUpdateArgs: [],
    leaveTypeRow: null,
    queryRawResult: [],
    leaveBalanceUpdateArgs: [],
    usersById: { 'requester-1': { name: 'Requester One', notificationPreferences: { request_status_changed: { slack: false } } } },
  };
}

function fakeTx(state: TxState): Prisma.TransactionClient {
  return {
    request: {
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        state.requestUpdateManyArgs.push(args);
        return { count: state.requestUpdateManyCount };
      },
      findUniqueOrThrow: async () => ({
        id: 'req-1',
        status: state.requestUpdateManyArgs.at(-1)?.data.status ?? 'Pending Approval',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
    requestStatusHistory: { create: async (args: unknown) => { state.statusHistoryCreateArgs.push(args); } },
    auditLog: { create: async (args: unknown) => { state.auditLogCreateArgs.push(args); } },
    requestApprover: {
      updateMany: async (args: unknown) => { state.approverUpdateManyArgs.push(args); },
    },
    user: {
      findUnique: async (args: { where: { id: string } }) => state.usersById[args.where.id] ?? null,
    },
    notification: {
      create: async (args: { data: Record<string, unknown> }) => {
        state.notificationCreateArgs.push(args);
        return { id: 'n1', ...args.data, createdAt: new Date() };
      },
    },
    visitor: {
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        state.visitorUpdateArgs.push(args);
      },
    },
    leaveType: { findFirst: async () => state.leaveTypeRow },
    leaveBalance: {
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        state.leaveBalanceUpdateArgs.push(args);
        return { id: 'lb1', ...args.data };
      },
    },
    $queryRaw: async () => state.queryRawResult,
  } as unknown as Prisma.TransactionClient;
}

test('applyDeclaredTransition throws 400 when no transition is declared for the requested toState', async () => {
  const state = freshState();
  const request = baseRow() as unknown as RequestWithForm;
  await assert.rejects(
    applyDeclaredTransition(fakeTx(state), 't1', request, 'Nonexistent', 'actor-1', undefined),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('applyDeclaredTransition throws 409 on an optimistic-lock miss (status changed concurrently)', async () => {
  const state = freshState();
  state.requestUpdateManyCount = 0;
  const request = baseRow({ status: 'Approved' }) as unknown as RequestWithForm;
  await assert.rejects(
    applyDeclaredTransition(fakeTx(state), 't1', request, 'Cancelled', 'hr-1', undefined),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );
});

test('applyDeclaredTransition applies the transition, writes history + audit, and notifies the requester generically', async () => {
  const state = freshState();
  const request = baseRow({ status: 'Approved' }) as unknown as RequestWithForm;
  const result = await applyDeclaredTransition(fakeTx(state), 't1', request, 'Cancelled', 'hr-1', 'cancelling');

  assert.equal(state.requestUpdateManyArgs.length, 1);
  assert.equal(state.requestUpdateManyArgs[0].data.status, 'Cancelled');
  assert.equal(state.statusHistoryCreateArgs.length, 1);
  assert.equal(state.auditLogCreateArgs.length, 1);
  assert.equal(state.approverUpdateManyArgs.length, 0); // no decisionOutcome -> no reconciliation
  assert.equal(state.notificationCreateArgs.length, 1);
  assert.equal(state.notificationCreateArgs[0].data.type, 'request_status_changed');
  assert.equal(result.status, 'Cancelled');
});

test('applyDeclaredTransition skips the requester notification when the actor IS the requester', async () => {
  const state = freshState();
  const request = baseRow({ status: 'Pending Approval', requesterId: 'requester-1' }) as unknown as RequestWithForm;
  await applyDeclaredTransition(fakeTx(state), 't1', request, 'Withdrawn', 'requester-1', undefined);
  assert.equal(state.notificationCreateArgs.length, 0);
});

test('applyDeclaredTransition reconciles remaining pending approvers on a rejected decisionOutcome', async () => {
  const state = freshState();
  const request = baseRow({ status: 'Pending Approval' }) as unknown as RequestWithForm;
  const rejectModel = { states: ['Pending Approval', 'Rejected'], transitions: [{ from: 'Pending Approval', to: 'Rejected', roles: ['tech-lead'] }] };
  (request as unknown as { form: { statusModel: unknown } }).form.statusModel = rejectModel;

  await applyDeclaredTransition(fakeTx(state), 't1', request, 'Rejected', 'approver-1', 'no', 'rejected');

  assert.equal(state.approverUpdateManyArgs.length, 1);
  const notif = state.notificationCreateArgs.find((c) => c.data.type === 'request_rejected');
  assert.equal((notif!.data.payload as { reason?: string }).reason, 'no');
});

test('applyDeclaredTransition names the approver on an approved decisionOutcome notification', async () => {
  const state = freshState();
  state.usersById['approver-1'] = { name: 'Alice', notificationPreferences: { request_approved: { slack: false } } };
  const approveModel = { states: ['Pending Approval', 'Approved'], transitions: [{ from: 'Pending Approval', to: 'Approved', roles: ['tech-lead'] }] };
  const request = baseRow({ status: 'Pending Approval', form: { key: 'wfh', title: 'WFH', statusModel: approveModel } }) as unknown as RequestWithForm;

  await applyDeclaredTransition(fakeTx(state), 't1', request, 'Approved', 'approver-1', undefined, 'approved');

  const notif = state.notificationCreateArgs.find((c) => c.data.type === 'request_approved');
  assert.equal((notif!.data.payload as { approverName?: string }).approverName, 'Alice');
});

test('applyDeclaredTransition falls back to "An approver" when the deciding user cannot be found', async () => {
  const state = freshState();
  const approveModel = { states: ['Pending Approval', 'Approved'], transitions: [{ from: 'Pending Approval', to: 'Approved', roles: ['tech-lead'] }] };
  const request = baseRow({ status: 'Pending Approval', form: { key: 'wfh', title: 'WFH', statusModel: approveModel } }) as unknown as RequestWithForm;

  await applyDeclaredTransition(fakeTx(state), 't1', request, 'Approved', 'ghost-approver', undefined, 'approved');

  const notif = state.notificationCreateArgs.find((c) => c.data.type === 'request_approved');
  assert.equal((notif!.data.payload as { approverName?: string }).approverName, 'An approver');
});

test('applyDeclaredTransition restores the leave balance on Approved -> Cancelled for a leave-form request', async () => {
  const state = freshState();
  state.leaveTypeRow = { id: 'lt-1', isPaid: true };
  state.queryRawResult = [{ id: 'lb-1', balance: 5 }];
  const request = baseRow({
    status: 'Approved',
    form: { key: 'leave', title: 'Leave Request', statusModel: STATUS_MODEL },
    leaveTypeId: 'Casual Leave',
    totalDays: 2,
    halfDayCount: 0,
  }) as unknown as RequestWithForm;

  await applyDeclaredTransition(fakeTx(state), 't1', request, 'Cancelled', 'hr-1', undefined);

  assert.equal(state.leaveBalanceUpdateArgs.length, 1);
  // credit back (sign +1): 5 + 2 = 7.
  assert.equal(state.leaveBalanceUpdateArgs[0].data.balance, 7);
});

test('applyDeclaredTransition does NOT restore a balance on Approved -> Cancelled for a non-leave (WFH) request', async () => {
  const state = freshState();
  const request = baseRow({ status: 'Approved', form: { key: 'wfh', title: 'WFH Request', statusModel: STATUS_MODEL } }) as unknown as RequestWithForm;

  await applyDeclaredTransition(fakeTx(state), 't1', request, 'Cancelled', 'hr-1', undefined);

  assert.equal(state.leaveBalanceUpdateArgs.length, 0);
});

test('applyDeclaredTransition records a visitor check-in on Approved -> Checked-In', async () => {
  const state = freshState();
  const request = baseRow({ status: 'Approved', form: { key: 'visitor', title: 'Visitor Registration', statusModel: VISITOR_STATUS_MODEL } }) as unknown as RequestWithForm;

  await applyDeclaredTransition(fakeTx(state), 't1', request, 'Checked-In', 'front-desk-1', undefined);

  assert.equal(state.visitorUpdateArgs.length, 1);
  assert.deepEqual(state.visitorUpdateArgs[0].where, { requestId: 'req-1' });
  assert.ok(state.visitorUpdateArgs[0].data.checkInAt instanceof Date);
});

test('applyDeclaredTransition records a visitor check-out on Checked-In -> Checked-Out', async () => {
  const state = freshState();
  const request = baseRow({ status: 'Checked-In', form: { key: 'visitor', title: 'Visitor Registration', statusModel: VISITOR_STATUS_MODEL } }) as unknown as RequestWithForm;

  await applyDeclaredTransition(fakeTx(state), 't1', request, 'Checked-Out', 'front-desk-1', undefined);

  assert.equal(state.visitorUpdateArgs.length, 1);
  assert.ok(state.visitorUpdateArgs[0].data.checkOutAt instanceof Date);
});

// ── `transitionRequest` / `systemTransitionRequest` — top-level Prisma singleton stubs
// (forms.service.test.ts pattern: these functions read `prisma` directly, not a passed-in `tx`). ─

let requestRow: Record<string, unknown> | null;
let txState: TxState;

Object.defineProperty(prisma, 'request', {
  value: { findFirst: async () => requestRow },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => fn(fakeTx(txState)),
  configurable: true,
});

beforeEach(() => {
  requestRow = baseRow();
  txState = freshState();
});

test('transitionRequest throws 404 when the request does not exist', async () => {
  requestRow = null;
  await assert.rejects(
    transitionRequest('t1', 'req-1', { id: 'requester-1', roles: [] }, { toState: 'Withdrawn' }),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
});

test('transitionRequest throws 400 when the form has no status model', async () => {
  requestRow = baseRow({ form: { key: 'wfh', title: 'WFH', statusModel: null } });
  await assert.rejects(
    transitionRequest('t1', 'req-1', { id: 'requester-1', roles: [] }, { toState: 'Withdrawn' }),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('transitionRequest refuses an Approved/Rejected toState when the request has snapshotted approvers (must use the decision endpoint)', async () => {
  requestRow = baseRow({ approvers: [{ id: 'ra-1', approverId: 'approver-1', decision: 'pending' }] });
  await assert.rejects(
    transitionRequest('t1', 'req-1', { id: 'hr-1', roles: ['hr-head'] }, { toState: 'Approved' }),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('transitionRequest throws 400 when no transition is declared for the requested toState', async () => {
  await assert.rejects(
    transitionRequest('t1', 'req-1', { id: 'requester-1', roles: [] }, { toState: 'Nonexistent' }),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('transitionRequest allows the requester on a requester-gated transition', async () => {
  const result = await transitionRequest('t1', 'req-1', { id: 'requester-1', roles: [] }, { toState: 'Withdrawn' });
  assert.equal(result.status, 'Withdrawn');
  assert.equal(txState.requestUpdateManyArgs[0].data.status, 'Withdrawn');
});

test('transitionRequest throws 403 for an actor who is neither the requester nor holds a gated role', async () => {
  await assert.rejects(
    transitionRequest('t1', 'req-1', { id: 'someone-else', roles: ['employee'] }, { toState: 'Withdrawn' }),
    (err: unknown) => err instanceof HttpError && err.status === 403,
  );
});

test('transitionRequest allows an actor whose roles include the transition-gated role', async () => {
  requestRow = baseRow({ status: 'Approved' });
  const result = await transitionRequest('t1', 'req-1', { id: 'hr-1', roles: ['hr-head'] }, { toState: 'Cancelled' });
  assert.equal(result.status, 'Cancelled');
});

test('transitionRequest throws 409 when the requester tries to withdraw after an approver has already decided', async () => {
  requestRow = baseRow({ approvers: [{ id: 'ra-1', approverId: 'approver-1', decision: 'approved' }] });
  await assert.rejects(
    transitionRequest('t1', 'req-1', { id: 'requester-1', roles: [] }, { toState: 'Withdrawn' }),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );
});

test('transitionRequest allows withdraw while every snapshotted approver is still pending', async () => {
  requestRow = baseRow({ approvers: [{ id: 'ra-1', approverId: 'approver-1', decision: 'pending' }] });
  const result = await transitionRequest('t1', 'req-1', { id: 'requester-1', roles: [] }, { toState: 'Withdrawn' });
  assert.equal(result.status, 'Withdrawn');
});

test('transitionRequest (IT claim gate) throws 409 when the IT-Admin-gated transition has no assignee yet', async () => {
  requestRow = baseRow({ status: 'Pending Approval', form: { key: 'it', title: 'IT Request', statusModel: IT_STATUS_MODEL }, itAssigneeId: null });
  await assert.rejects(
    transitionRequest('t1', 'req-1', { id: 'it-admin-1', roles: ['it-admin'] }, { toState: 'Fulfilled' }),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );
});

test('transitionRequest (IT claim gate) throws 403 when a different IT Admin than the claimed assignee attempts the transition', async () => {
  requestRow = baseRow({ status: 'Pending Approval', form: { key: 'it', title: 'IT Request', statusModel: IT_STATUS_MODEL }, itAssigneeId: 'it-admin-1' });
  await assert.rejects(
    transitionRequest('t1', 'req-1', { id: 'it-admin-2', roles: ['it-admin'] }, { toState: 'Fulfilled' }),
    (err: unknown) => err instanceof HttpError && err.status === 403,
  );
});

test('transitionRequest (IT claim gate) allows the claimed assignee through', async () => {
  requestRow = baseRow({ status: 'Pending Approval', form: { key: 'it', title: 'IT Request', statusModel: IT_STATUS_MODEL }, itAssigneeId: 'it-admin-1' });
  const result = await transitionRequest('t1', 'req-1', { id: 'it-admin-1', roles: ['it-admin'] }, { toState: 'Fulfilled' });
  assert.equal(result.status, 'Fulfilled');
});

test('systemTransitionRequest throws 404 when the request does not exist', async () => {
  requestRow = null;
  await assert.rejects(
    systemTransitionRequest('t1', 'req-1', 'Completed'),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
});

test('systemTransitionRequest throws 400 when the form has no status model', async () => {
  requestRow = baseRow({ form: { key: 'wfh', title: 'WFH', statusModel: null } });
  await assert.rejects(
    systemTransitionRequest('t1', 'req-1', 'Completed'),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('systemTransitionRequest throws 400 when no system-gated transition matches', async () => {
  // "Withdrawn" is declared but gated to `requester`, not `system` — systemTransitionRequest
  // must never apply a transition a human actor couldn't have reached via `transitionRequest`.
  requestRow = baseRow({ status: 'Pending Approval' });
  await assert.rejects(
    systemTransitionRequest('t1', 'req-1', 'Withdrawn'),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('systemTransitionRequest applies a system-gated transition with a null actor and still notifies the requester', async () => {
  requestRow = baseRow({ status: 'Approved' });
  const result = await systemTransitionRequest('t1', 'req-1', 'Completed');

  assert.equal(result.status, 'Completed');
  assert.equal(txState.notificationCreateArgs.length, 1);
  assert.equal(txState.notificationCreateArgs[0].data.type, 'request_status_changed');
});
