import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../prisma.js';
import { redisConnection } from '../lib/redis.js';
import { runAutoCompleteRequests } from './auto-complete-requests.job.js';

// See approval-reminders.job.test.ts: importing any job module pulls in the eagerly-connecting
// `redisConnection` — disconnect immediately so an unreachable Redis doesn't hang the process.
redisConnection.disconnect();

const STATUS_MODEL = {
  states: ['Approved', 'Completed'],
  transitions: [{ from: 'Approved', to: 'Completed', roles: ['system'] }],
};

let findManyArgs: unknown[];
let dueRows: Array<{ id: string; tenantId: string }>;
let findFirstArgs: unknown[];
let fullRequest: Record<string, unknown> | null;
let requestUpdateManyArgs: unknown[];
let requestStatusHistoryCreateArgs: unknown[];
let auditLogCreateArgs: unknown[];
let notificationCreateArgs: unknown[];

Object.defineProperty(prisma, 'request', {
  value: {
    findMany: async (args: unknown) => {
      findManyArgs.push(args);
      return dueRows;
    },
    findFirst: async (args: unknown) => {
      findFirstArgs.push(args);
      return fullRequest;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      request: {
        updateMany: async (args: unknown) => {
          requestUpdateManyArgs.push(args);
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({ id: 'req-1', status: 'Completed', createdAt: new Date() }),
      },
      requestStatusHistory: {
        create: async (args: unknown) => {
          requestStatusHistoryCreateArgs.push(args);
        },
      },
      auditLog: {
        create: async (args: unknown) => {
          auditLogCreateArgs.push(args);
        },
      },
      user: {
        // `notify()`'s isChannelEnabled reads — disables the Slack channel for this (non-mandatory)
        // type so it never reaches `mirrorToSlack` → BullMQ, which would otherwise also need a
        // live Redis. inApp defaults to enabled (no stored override), so notification.create runs.
        findUnique: async () => ({ notificationPreferences: { request_status_changed: { slack: false } } }),
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
  findManyArgs = [];
  dueRows = [];
  findFirstArgs = [];
  fullRequest = null;
  requestUpdateManyArgs = [];
  requestStatusHistoryCreateArgs = [];
  auditLogCreateArgs = [];
  notificationCreateArgs = [];
});

test('queries only Approved leave/wfh requests whose endDate is before the start of today in Asia/Kolkata', async () => {
  dueRows = [];
  await runAutoCompleteRequests();

  assert.equal(findManyArgs.length, 1);
  const { where } = findManyArgs[0] as { where: { status: string; form: { key: { in: string[] } }; endDate: { lt: Date } } };
  assert.equal(where.status, 'Approved');
  assert.deepEqual(where.form.key.in, ['leave', 'wfh']);
  // 00:00 IST == 18:30 UTC the previous calendar day (UTC+5:30, no DST) — a real, independent
  // check on startOfTodayIST's math, not just a copy of the source formula.
  assert.equal(where.endDate.lt.getUTCHours(), 18);
  assert.equal(where.endDate.lt.getUTCMinutes(), 30);

  // No due requests — never enters the transition path.
  assert.equal(findFirstArgs.length, 0);
});

test('auto-completes each due Approved request via the declared system transition and notifies the requester', async () => {
  dueRows = [{ id: 'req-1', tenantId: 't1' }];
  fullRequest = {
    id: 'req-1',
    tenantId: 't1',
    status: 'Approved',
    requesterId: 'requester-1',
    form: { key: 'leave', title: 'Leave Request', statusModel: STATUS_MODEL },
  };

  await runAutoCompleteRequests();

  assert.equal(findFirstArgs.length, 1);
  assert.equal(requestUpdateManyArgs.length, 1);
  const { where, data } = requestUpdateManyArgs[0] as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.equal(where.id, 'req-1');
  assert.equal(where.status, 'Approved');
  assert.equal(data.status, 'Completed');

  assert.equal(requestStatusHistoryCreateArgs.length, 1);
  assert.equal(auditLogCreateArgs.length, 1);

  // The system actor (null) is never the requester, so the requester is always notified.
  assert.equal(notificationCreateArgs.length, 1);
  const { data: notificationData } = notificationCreateArgs[0] as { data: Record<string, unknown> };
  assert.equal(notificationData.userId, 'requester-1');
  assert.equal(notificationData.type, 'request_status_changed');
});

test('does nothing when there are no due requests', async () => {
  dueRows = [];
  await runAutoCompleteRequests();
  assert.equal(requestUpdateManyArgs.length, 0);
  assert.equal(notificationCreateArgs.length, 0);
});
