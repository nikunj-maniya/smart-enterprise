import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { listNotifications, markAllRead, markRead, notify, notifyMany } from './notifications.service.js';
import { redisConnection } from '../../lib/redis.js';

// notifications.service.js transitively imports the BullMQ `redisConnection` (via
// slack-delivery.js), which connects eagerly (no lazyConnect) and retries indefinitely — left
// alone, that keeps this process alive with no live Redis in CI. Silence its connection errors
// and disconnect immediately so the test run can exit (front-desk.routes.test.ts pattern).
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * Stubbed-Prisma unit tests (forms.service.test.ts pattern): CI has no live Postgres, so the
 * `notification` delegate is redefined as an in-memory stub for the direct-Prisma read/write
 * paths. `notify`/`notifyMany` take their transaction client as a parameter (escalation.service.test.ts
 * pattern), so those use a fake `tx` instead of touching the `prisma` singleton.
 *
 * The test notification type below ('approval_peer_decided') is deliberately a real catalog type
 * that is non-mandatory and absent from slack-delivery.ts's TRIGGER_TOGGLE map, so `mirrorToSlack`
 * returns before touching the BullMQ queue/Redis — keeping this suite DB- and Redis-free.
 */
const TEST_TYPE = 'approval_peer_decided';
// Matches this type's real payload shape (packages/shared/src/index.ts's notificationSchema
// union: requestNotificationPayloadSchema extended with approverName + decision) so these tests
// exercise the actual `notify`/`notifyMany` payload type instead of an arbitrary object.
const TEST_PAYLOAD = {
  requestId: 'r1',
  formKey: 'leave',
  formTitle: 'Leave Request',
  approverName: 'Alice',
  decision: 'approved' as const,
};

type NotificationRow = { id: string; type: string; payload: unknown; read: boolean; createdAt: Date };

let rows: NotificationRow[] = [];
const findManyArgs: unknown[] = [];
const countArgs: unknown[] = [];
const updateManyArgs: unknown[] = [];

Object.defineProperty(prisma, 'notification', {
  value: {
    findMany: async (args: unknown) => {
      findManyArgs.push(args);
      return rows;
    },
    count: async (args: unknown) => {
      countArgs.push(args);
      return rows.length;
    },
    updateMany: async (args: unknown) => {
      updateManyArgs.push(args);
      return { count: rows.length };
    },
  },
  configurable: true,
});

beforeEach(() => {
  rows = [];
  findManyArgs.length = 0;
  countArgs.length = 0;
  updateManyArgs.length = 0;
});

describe('listNotifications', () => {
  it('filters to unread when tab is "unread"', async () => {
    await listNotifications('u1', { tab: 'unread', page: 1, pageSize: 20 });
    const args = findManyArgs[0] as { where: { userId: string; read?: boolean } };
    assert.deepEqual(args.where, { userId: 'u1', read: false });
  });

  it('does not filter by read state when tab is "all"', async () => {
    await listNotifications('u1', { tab: 'all', page: 1, pageSize: 20 });
    const args = findManyArgs[0] as { where: { userId: string; read?: boolean } };
    assert.deepEqual(args.where, { userId: 'u1' });
  });

  it('paginates with skip/take derived from page and pageSize', async () => {
    await listNotifications('u1', { tab: 'all', page: 3, pageSize: 10 });
    const args = findManyArgs[0] as { skip: number; take: number };
    assert.equal(args.skip, 20);
    assert.equal(args.take, 10);
  });

  it('reports total and unreadCount alongside the requested page', async () => {
    rows = [{ id: 'n1', type: TEST_TYPE, payload: {}, read: false, createdAt: new Date('2026-01-01T00:00:00.000Z') }];

    const result = await listNotifications('u1', { tab: 'all', page: 1, pageSize: 20 });

    assert.equal(result.total, 1);
    assert.equal(result.unreadCount, 1);
    assert.equal(result.page, 1);
    assert.equal(result.pageSize, 20);
    assert.deepEqual(result.rows[0], { id: 'n1', type: TEST_TYPE, payload: {}, read: false, createdAt: '2026-01-01T00:00:00.000Z' });
  });

  it("unreadCount reflects the caller's total unread, independent of the current tab/page", async () => {
    rows = [{ id: 'n1', type: TEST_TYPE, payload: {}, read: false, createdAt: new Date() }];
    await listNotifications('u1', { tab: 'all', page: 1, pageSize: 20 });
    const unreadCountArgs = countArgs[1] as { where: { userId: string; read: boolean } };
    assert.deepEqual(unreadCountArgs.where, { userId: 'u1', read: false });
  });
});

describe('markRead / markAllRead', () => {
  it('markRead scopes the update to the given id and the calling user', async () => {
    await markRead('u1', 'n1');
    assert.deepEqual(updateManyArgs[0], { where: { id: 'n1', userId: 'u1' }, data: { read: true } });
  });

  it('markAllRead updates only the calling user\'s unread rows', async () => {
    await markAllRead('u1');
    assert.deepEqual(updateManyArgs[0], { where: { userId: 'u1', read: false }, data: { read: true } });
  });
});

/** Minimal fake of the subset of Prisma.TransactionClient that notify()/notifyMany() call. */
function fakeTx(notificationPreferences: unknown) {
  const created: unknown[] = [];
  const tx = {
    user: { findUnique: async () => ({ notificationPreferences }) },
    notification: {
      create: async ({ data }: { data: unknown }) => {
        created.push(data);
        return { id: `n-${created.length}`, ...(data as object), read: false, createdAt: new Date('2026-01-01T00:00:00.000Z') };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, created };
}

describe('notify', () => {
  it('creates an in-app row when the channel is enabled (default opt-out behavior)', async () => {
    const { tx, created } = fakeTx(null);

    await notify(tx, 't1', 'u1', { type: TEST_TYPE, payload: TEST_PAYLOAD });

    assert.equal(created.length, 1);
    assert.deepEqual(created[0], { tenantId: 't1', userId: 'u1', type: TEST_TYPE, payload: TEST_PAYLOAD, read: false });
  });

  it('skips creating a row when the user has muted in-app for this type', async () => {
    const { tx, created } = fakeTx({ [TEST_TYPE]: { inApp: false } });

    await notify(tx, 't1', 'u1', { type: TEST_TYPE, payload: TEST_PAYLOAD });

    assert.equal(created.length, 0);
  });
});

describe('notifyMany', () => {
  it('is a no-op for an empty recipient list', async () => {
    const { tx, created } = fakeTx(null);
    await notifyMany(tx, 't1', [], { type: TEST_TYPE, payload: TEST_PAYLOAD });
    assert.equal(created.length, 0);
  });

  it('writes one row per recipient', async () => {
    const { tx, created } = fakeTx(null);

    await notifyMany(tx, 't1', ['u1', 'u2', 'u3'], { type: TEST_TYPE, payload: TEST_PAYLOAD });

    assert.equal(created.length, 3);
    assert.deepEqual(
      created.map((c) => (c as { userId: string }).userId),
      ['u1', 'u2', 'u3'],
    );
  });
});
