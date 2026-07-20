import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { leaveTypesRouter } from './leave-types.routes.js';
import * as leaveTypesController from './leave-types.controller.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper CRUD behavior (create-with-balances,
 * duplicate-name 409, in-use delete 409) is covered by the scripted verification pass against
 * the dedicated test DB, since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/leave-types', leaveTypesRouter);
  app.use(errorHandler);
  return app;
}

const VALID_CREATE = { name: 'Comp Off', quota: 4, isPaid: true, carryForward: false, halfDayAllowed: true };

describe('leave-types routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/leave-types')).status, 401);
    assert.equal((await request(app).post('/leave-types').send(VALID_CREATE)).status, 401);
    assert.equal((await request(app).put('/leave-types/abc').send(VALID_CREATE)).status, 401);
    assert.equal((await request(app).delete('/leave-types/abc')).status, 401);
    assert.equal((await request(app).get('/leave-types/absence-cap')).status, 401);
    assert.equal((await request(app).put('/leave-types/absence-cap').send({ cap: 3 })).status, 401);
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

describe('leave-types controller guards', () => {
  it('rejects a create body with a blank name before touching Prisma (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(leaveTypesController.create, {
      body: { ...VALID_CREATE, name: '   ' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects a create body with a negative quota (Zod error)', async () => {
    const err = await invoke(leaveTypesController.create, {
      body: { ...VALID_CREATE, quota: -1 },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects an update body missing the required quota (Zod error — name/isPaid alone are not enough)', async () => {
    const err = await invoke(leaveTypesController.update, {
      body: { name: 'Renamed', isPaid: false },
      params: { id: 'lt1' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
