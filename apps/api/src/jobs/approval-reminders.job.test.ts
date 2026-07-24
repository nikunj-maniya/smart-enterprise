import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../prisma.js';
import { redisConnection } from '../lib/redis.js';
import { runApprovalReminders } from './approval-reminders.job.js';

// `redisConnection` (lib/redis.ts) connects eagerly at import time — importing this job module
// (or any module that pulls in BullMQ's Queue/Worker) would otherwise leave a reconnect timer
// running against a Redis that isn't there in this environment, keeping the test process alive
// forever. Disconnecting immediately, before any test runs, avoids that hang; nothing in this
// file exercises the queue/worker side (`scheduleApprovalRemindersJob`), only the plain
// `runApprovalReminders` function.
redisConnection.disconnect();

type PendingRow = { approverId: string; request: { tenantId: string } };

let pendingRows: PendingRow[];
let notificationCreateArgs: unknown[];
let userFindUniqueArgs: unknown[];

Object.defineProperty(prisma, 'requestApprover', {
  value: { findMany: async () => pendingRows },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      user: {
        findUnique: async (args: unknown) => {
          userFindUniqueArgs.push(args);
          // Disables the Slack channel for this (non-mandatory) type so `notify()` never reaches
          // `mirrorToSlack` → BullMQ's queue, which would otherwise also need a live Redis.
          return { notificationPreferences: { approval_reminder: { slack: false } } };
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
  notificationCreateArgs = [];
  userFindUniqueArgs = [];
});

test('runApprovalReminders sends one reminder per approver, citing their total pending count', async () => {
  pendingRows = [
    { approverId: 'approver-1', request: { tenantId: 't1' } },
    { approverId: 'approver-1', request: { tenantId: 't1' } },
    { approverId: 'approver-2', request: { tenantId: 't1' } },
  ];

  await runApprovalReminders();

  assert.equal(notificationCreateArgs.length, 2);
  const byApprover = new Map(
    notificationCreateArgs.map((args) => {
      const { data } = args as { data: { tenantId: string; userId: string; type: string; payload: { pendingCount: number } } };
      return [data.userId, data];
    }),
  );
  assert.equal(byApprover.get('approver-1')?.payload.pendingCount, 2);
  assert.equal(byApprover.get('approver-2')?.payload.pendingCount, 1);
  assert.equal(byApprover.get('approver-1')?.type, 'approval_reminder');
  assert.equal(byApprover.get('approver-1')?.tenantId, 't1');
});

test('runApprovalReminders sends nothing when no approvals are pending', async () => {
  pendingRows = [];
  await runApprovalReminders();
  assert.equal(notificationCreateArgs.length, 0);
});
