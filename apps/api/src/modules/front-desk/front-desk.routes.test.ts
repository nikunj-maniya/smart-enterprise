import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { frontDeskRouter } from './front-desk.routes.js';
import * as frontDeskController from './front-desk.controller.js';
import { errorHandler } from '../../middleware/error.js';
import { redisConnection } from '../../lib/redis.js';

// front-desk.routes.js transitively imports the BullMQ `redisConnection` (via
// transitions.service.js -> notifications.service.js -> slack-delivery.js), which connects
// eagerly (no lazyConnect) and retries indefinitely — left alone, that keeps this process alive
// with no live Redis in CI. Silence its connection errors and disconnect immediately so the test
// run can exit.
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper visitor-flow behavior is covered by
 * front-desk.service.test.ts's stubbed-Prisma suite, since CI has no database. The router's own
 * `requireFrontDeskAccess` role gate isn't unit-tested in isolation: it's a local, unexported
 * function (front-desk.routes.ts), and reaching it through the router requires `requireAuth` to
 * succeed first, which needs a live DB/Redis-backed session — unavailable in CI.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/front-desk', frontDeskRouter);
  app.use(errorHandler);
  return app;
}

describe('front-desk routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/front-desk/today')).status, 401);
    assert.equal(
      (await request(app).post('/front-desk/r1/check-in').send({ signature: 'x', consent: true })).status,
      401,
    );
    assert.equal((await request(app).get('/front-desk/r1/signature-url')).status, 401);
  });
});

/** Controller-level checks with a stubbed request — exercises guards that run before the service. */
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
  it('rejects a check-in body missing the signature (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(frontDeskController.checkIn, {
      body: { consent: true },
      params: { requestId: 'r1' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects a check-in body missing consent (Zod error)', async () => {
    const err = await invoke(frontDeskController.checkIn, {
      body: { signature: 'data:image/png;base64,AAAA' },
      params: { requestId: 'r1' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects a check-in body with a blank signature (Zod error)', async () => {
    const err = await invoke(frontDeskController.checkIn, {
      body: { signature: '', consent: true },
      params: { requestId: 'r1' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
