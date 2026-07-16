import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { holidaysRouter } from './holidays.routes.js';
import * as holidaysController from './holidays.controller.js';
import { errorHandler } from '../../middleware/error.js';
import { HttpError } from '../../lib/http-error.js';

/**
 * Real router + error handler on a throwaway app (auth.test.ts pattern). Only paths that
 * reject before any Prisma call run here — deeper CRUD behavior is covered by the scripted
 * verification pass (tasks.md 5.2), since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/holidays', holidaysRouter);
  app.use(errorHandler);
  return app;
}

describe('holidays routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/holidays?year=2026')).status, 401);
    assert.equal((await request(app).post('/holidays').send({ date: '2026-01-26', name: 'X' })).status, 401);
    assert.equal((await request(app).put('/holidays/abc').send({ name: 'X' })).status, 401);
    assert.equal((await request(app).delete('/holidays/abc')).status, 401);
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

describe('holidays controller guards', () => {
  it('rejects a platform admin (no tenant) listing holidays with 403', async () => {
    const err = await invoke(holidaysController.list, {
      query: { year: '2026' },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: true, tenantId: null, roles: [] },
    });
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 403);
    assert.equal(err.message, 'Tenant context required');
  });

  it('rejects an invalid year before touching anything else (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(holidaysController.list, {
      query: { year: 'not-a-year' },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: [] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err instanceof HttpError, false); // Zod error, mapped to 400 by errorHandler
  });
});
