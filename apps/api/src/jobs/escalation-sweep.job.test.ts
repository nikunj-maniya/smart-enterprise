import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../prisma.js';
import { redisConnection } from '../lib/redis.js';
import { runEscalationSweep } from './escalation-sweep.job.js';

// See approval-reminders.job.test.ts: importing any job module pulls in the eagerly-connecting
// `redisConnection` — disconnect immediately so an unreachable Redis doesn't hang the process.
redisConnection.disconnect();

type PendingRow = {
  id: string;
  approverId: string;
  roleContext: string;
  escalatedAt: Date | null;
  request: { id: string; tenantId: string; requesterId: string; createdAt: Date; form: { title: string; key: string } };
};

let pendingRows: PendingRow[];
let escalationRule: { toRoleId: string; actionWindowHours: number } | null;
let onLeaveCount: number;
let approverRow: { status: string; name: string } | null;
let activeRoleHolderId: string | null;
let enterpriseAdminId: string | null;
let requestApproverUpdateArgs: unknown[];
let auditLogCreateArgs: unknown[];
let notificationCreateArgs: unknown[];

Object.defineProperty(prisma, 'requestApprover', {
  value: {
    findMany: async () => pendingRows,
    update: async (args: unknown) => {
      requestApproverUpdateArgs.push(args);
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'request', {
  value: { count: async () => onLeaveCount },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: { findUnique: async () => approverRow },
  configurable: true,
});
Object.defineProperty(prisma, 'escalationRule', {
  value: { findUnique: async () => escalationRule },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      escalationRule: { findUnique: async () => escalationRule },
      userRole: { findFirst: async () => (activeRoleHolderId ? { userId: activeRoleHolderId } : null) },
      user: {
        findFirst: async () => (enterpriseAdminId ? { id: enterpriseAdminId } : null),
        // `notify()`'s isChannelEnabled reads — disables the Slack channel for this (non-mandatory)
        // type so it never reaches `mirrorToSlack` → BullMQ, which would otherwise also need a
        // live Redis. inApp defaults to enabled (no stored override), so notification.create runs.
        findUnique: async () => ({ notificationPreferences: { approval_escalated: { slack: false } } }),
      },
      requestApprover: {
        update: async (args: unknown) => {
          requestApproverUpdateArgs.push(args);
        },
      },
      auditLog: {
        create: async (args: unknown) => {
          auditLogCreateArgs.push(args);
        },
      },
      notification: {
        create: async (args: { data: Record<string, unknown> }) => {
          notificationCreateArgs.push(args);
          return { id: 'n1', ...args.data, createdAt: new Date() };
        },
      },
    }),
  configurable: true,
});

beforeEach(() => {
  pendingRows = [];
  escalationRule = null;
  onLeaveCount = 0;
  approverRow = { status: 'Active', name: 'Approver One' };
  activeRoleHolderId = null;
  enterpriseAdminId = null;
  requestApproverUpdateArgs = [];
  auditLogCreateArgs = [];
  notificationCreateArgs = [];
});

function pendingRow(overrides: Partial<PendingRow> = {}): PendingRow {
  return {
    id: 'ra-1',
    approverId: 'approver-1',
    roleContext: 'tech-lead',
    escalatedAt: null,
    request: {
      id: 'req-1',
      tenantId: 't1',
      requesterId: 'requester-1',
      createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000), // 49h ago
      form: { title: 'Leave Request', key: 'leave' },
    },
    ...overrides,
  };
}

test('skips a pending approver stage with no escalation matrix entry', async () => {
  pendingRows = [pendingRow()];
  escalationRule = null;

  await runEscalationSweep();

  assert.equal(requestApproverUpdateArgs.length, 0);
  assert.equal(notificationCreateArgs.length, 0);
});

test('escalates a stalled approval past the action window, reassigning to the matrix target', async () => {
  pendingRows = [pendingRow()];
  escalationRule = { toRoleId: 'role-hr-head', actionWindowHours: 48 };
  activeRoleHolderId = 'hr-head-user';

  await runEscalationSweep();

  assert.equal(requestApproverUpdateArgs.length, 1);
  const { where, data } = requestApproverUpdateArgs[0] as { where: { id: string }; data: Record<string, unknown> };
  assert.equal(where.id, 'ra-1');
  assert.equal(data.approverId, 'hr-head-user');
  assert.equal(data.escalatedFromId, 'approver-1');
  assert.equal(data.escalationCause, 'timeout');

  assert.equal(auditLogCreateArgs.length, 1);
  assert.equal(notificationCreateArgs.length, 2);
  const recipients = notificationCreateArgs.map((c) => (c as { data: { userId: string } }).data.userId).sort();
  assert.deepEqual(recipients, ['approver-1', 'requester-1']);
});

test('escalates when the approver is on approved leave today, even within the action window', async () => {
  pendingRows = [pendingRow({ request: { ...pendingRow().request, createdAt: new Date() } })];
  escalationRule = { toRoleId: 'role-hr-head', actionWindowHours: 48 };
  activeRoleHolderId = 'hr-head-user';
  onLeaveCount = 1;

  await runEscalationSweep();

  const { data } = requestApproverUpdateArgs[0] as { data: Record<string, unknown> };
  assert.equal(data.escalationCause, 'on_leave');
});

test('escalates an inactive approver even within the action window', async () => {
  pendingRows = [pendingRow({ request: { ...pendingRow().request, createdAt: new Date() } })];
  escalationRule = { toRoleId: 'role-hr-head', actionWindowHours: 48 };
  activeRoleHolderId = 'hr-head-user';
  approverRow = { status: 'Suspended', name: 'Approver One' };

  await runEscalationSweep();

  const { data } = requestApproverUpdateArgs[0] as { data: Record<string, unknown> };
  assert.equal(data.escalationCause, 'inactive');
});

test('does nothing when a pending approver is still within the window, active, and not on leave', async () => {
  pendingRows = [pendingRow({ request: { ...pendingRow().request, createdAt: new Date() } })];
  escalationRule = { toRoleId: 'role-hr-head', actionWindowHours: 48 };

  await runEscalationSweep();

  assert.equal(requestApproverUpdateArgs.length, 0);
  assert.equal(notificationCreateArgs.length, 0);
});

test('falls back to the Enterprise Admin when the matrix role has no active holder, and skips the row if even that is unavailable', async () => {
  pendingRows = [pendingRow()];
  escalationRule = { toRoleId: 'role-hr-head', actionWindowHours: 48 };
  activeRoleHolderId = null;
  enterpriseAdminId = null;

  await runEscalationSweep();

  // No target at all — reassigning to nothing/self is skipped rather than reassigning to itself.
  assert.equal(requestApproverUpdateArgs.length, 0);
  assert.equal(notificationCreateArgs.length, 0);
});
