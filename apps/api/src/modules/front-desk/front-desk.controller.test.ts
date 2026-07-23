import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { redisConnection } from '../../lib/redis.js';
import * as frontDeskController from './front-desk.controller.js';

// front-desk.controller.js transitively imports the BullMQ `redisConnection` (via
// front-desk.service.js -> transitions.service.js -> notifications.service.js ->
// slack-delivery.js), which connects eagerly (no lazyConnect) and retries indefinitely —
// left alone, that keeps this process alive with no live Redis in CI (front-desk.service.test.ts
// pattern). Silence its connection errors and disconnect immediately so the run can exit.
redisConnection.on('error', () => {});
redisConnection.disconnect();

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 * reaches Prisma (auth.controller.test.ts / holidays.routes.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

const ADMIN = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] };

describe('front-desk controller guards', () => {
  it('today forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(frontDeskController.today, {});
    assert.ok(err instanceof TypeError);
  });

  it('checkIn rejects a body missing the signature (Zod error)', async () => {
    const err = await invoke(frontDeskController.checkIn, {
      body: { consent: true },
      params: { requestId: 'r1' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('checkIn rejects a body missing consent (Zod error)', async () => {
    const err = await invoke(frontDeskController.checkIn, {
      body: { signature: 'data:image/png;base64,AAAA' },
      params: { requestId: 'r1' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('checkIn forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(frontDeskController.checkIn, {
      body: { signature: 'data:image/png;base64,AAAA', consent: true },
      params: { requestId: 'r1' },
    });
    assert.ok(err instanceof TypeError);
  });

  it('signatureUrl forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(frontDeskController.signatureUrl, { params: { requestId: 'r1' } });
    assert.ok(err instanceof TypeError);
  });
});
