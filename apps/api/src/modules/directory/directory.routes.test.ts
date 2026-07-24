import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { directoryRouter } from './directory.routes.js';
import * as directoryController from './directory.controller.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper search/filter behavior is covered by
 * directory.service.test.ts's stubbed-Prisma suite, since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use('/directory', directoryRouter);
  app.use(errorHandler);
  return app;
}

describe('directory routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/directory/users')).status, 401);
    assert.equal((await request(app).get('/directory/projects')).status, 401);
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

const USER = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: [] };

describe('directory controller guards', () => {
  it('rejects a users query with a limit over the max of 50 (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(directoryController.users, { query: { limit: '999' }, user: USER });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects a projects query with a limit of 0 (below the min of 1)', async () => {
    const err = await invoke(directoryController.projects, { query: { limit: '0' }, user: USER });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
