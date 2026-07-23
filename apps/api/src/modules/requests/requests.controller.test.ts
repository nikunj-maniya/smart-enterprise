import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import * as requestsController from './requests.controller.js';
import { redisConnection } from '../../lib/redis.js';

// requests.controller.js transitively imports the BullMQ `redisConnection` (via requests.service.js
// -> notifications.service.js -> slack-delivery.js), which connects eagerly and retries
// indefinitely — left alone, that keeps this process alive with no live Redis in CI. Silence its
// connection errors and disconnect immediately so the test run can exit (front-desk.routes.test.ts
// pattern).
redisConnection.on('error', () => {});
redisConnection.disconnect();

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 * reaches Prisma (holidays.routes.test.ts / enterprises.controller.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

const USER = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: [] };

describe('requests controller guards', () => {
  it('create rejects a body missing formKey (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(requestsController.create, { body: { payload: {} }, user: USER });
    assert.ok(err instanceof ZodError);
  });

  it('create rejects a body whose payload is not an object', async () => {
    const err = await invoke(requestsController.create, { body: { formKey: 'leave', payload: 'nope' }, user: USER });
    assert.ok(err instanceof ZodError);
  });

  it('listMine rejects a pageSize over the 100 cap before calling the service', async () => {
    const err = await invoke(requestsController.listMine, { query: { pageSize: '101' }, user: USER });
    assert.ok(err instanceof ZodError);
  });

  it('listMine rejects a non-numeric page before calling the service', async () => {
    const err = await invoke(requestsController.listMine, { query: { page: 'not-a-number' }, user: USER });
    assert.ok(err instanceof ZodError);
  });

  it('listApprovals rejects an unrecognized tab value before calling the service', async () => {
    const err = await invoke(requestsController.listApprovals, { query: { tab: 'not-a-tab' }, user: USER });
    assert.ok(err instanceof ZodError);
  });

  it('getById forwards a TypeError to next() when req.user is missing (no service call reached)', async () => {
    const err = await invoke(requestsController.getById, { params: { id: 'r1' } });
    assert.ok(err instanceof TypeError);
  });

  it('create forwards a TypeError to next() when req.user is missing (no service call reached)', async () => {
    const err = await invoke(requestsController.create, { body: { formKey: 'leave', payload: {} } });
    assert.ok(err instanceof TypeError);
  });
});
