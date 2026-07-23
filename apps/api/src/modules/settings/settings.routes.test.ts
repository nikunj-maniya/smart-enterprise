import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { settingsRouter } from './settings.routes.js';
import * as settingsController from './settings.controller.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper behavior is covered by
 * settings.service.test.ts (stubbed Prisma), since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/settings', settingsRouter);
  app.use(errorHandler);
  return app;
}

describe('settings routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/settings')).status, 401);
    assert.equal((await request(app).put('/settings').send({})).status, 401);
  });
});

/** Controller-level checks with a stubbed request — exercises Zod validation before any service call. */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

describe('settings controller guards', () => {
  it('update rejects a non-boolean field before calling the service (Zod error)', async () => {
    const err = await invoke(settingsController.update, {
      body: { allowPublicRegistration: 'yes' },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: true, tenantId: null, roles: [] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update rejects a wrong-typed known field before calling the service (Zod error)', async () => {
    const err = await invoke(settingsController.update, {
      body: { notifyOnNewRegistration: 1 },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: true, tenantId: null, roles: [] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
