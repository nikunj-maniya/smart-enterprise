import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { redisConnection } from '../../lib/redis.js';
import * as notificationsController from './notifications.controller.js';

// notifications.controller.js transitively imports the BullMQ `redisConnection` (via
// notifications.service.js -> slack-delivery.js), which connects eagerly (no lazyConnect) and
// retries indefinitely — left alone, that keeps this process alive with no live Redis in CI.
// Silence its connection errors and disconnect immediately so the test run can exit
// (front-desk.routes.test.ts pattern).
redisConnection.on('error', () => {});
redisConnection.disconnect();

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 *  reaches Prisma (auth.controller.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

describe('notifications controller guards', () => {
  it('list rejects an invalid tab before touching Prisma (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(notificationsController.list, { query: { tab: 'archived' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects a pageSize over the max (Zod error)', async () => {
    const err = await invoke(notificationsController.list, { query: { pageSize: '1000' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('markRead forwards a synchronous error to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(notificationsController.markRead, { params: { id: 'n1' } });
    assert.ok(err instanceof TypeError);
  });

  it('markAllRead forwards a synchronous error to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(notificationsController.markAllRead, {});
    assert.ok(err instanceof TypeError);
  });
});
