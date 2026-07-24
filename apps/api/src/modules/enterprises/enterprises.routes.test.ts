import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { enterprisesRouter } from './enterprises.routes.js';
import * as enterprisesController from './enterprises.controller.js';
import { requireSystemAdmin } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper CRUD behavior is covered by
 * enterprises.service.test.ts (stubbed Prisma) and the scripted verification pass, since CI has
 * no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/enterprises', enterprisesRouter);
  app.use(errorHandler);
  return app;
}

describe('enterprises routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/enterprises')).status, 401);
    assert.equal((await request(app).post('/enterprises/t1/suspend')).status, 401);
    assert.equal((await request(app).post('/enterprises/t1/reactivate')).status, 401);
  });
});

/** This module is System-Admin (platform) only — no tenant-scoped role can reach it. */
describe('enterprises requireSystemAdmin guard', () => {
  it('rejects a tenant-scoped Enterprise Admin with 403', () => {
    let outcome: unknown;
    requireSystemAdmin(
      { user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] } } as Partial<Request> as Request,
      {} as Response,
      (err?: unknown) => {
        outcome = err;
      },
    );
    assert.ok(outcome instanceof Error);
    assert.equal((outcome as { status?: number }).status, 403);
  });

  it('rejects an unauthenticated request with 403', () => {
    let outcome: unknown;
    requireSystemAdmin({ user: undefined } as Partial<Request> as Request, {} as Response, (err?: unknown) => {
      outcome = err;
    });
    assert.ok(outcome instanceof Error);
    assert.equal((outcome as { status?: number }).status, 403);
  });

  it('passes a platform System Admin through', () => {
    let outcome: unknown;
    requireSystemAdmin(
      { user: { id: 'u1', email: 'a@b.c', isSystemAdmin: true, tenantId: null, roles: [] } } as Partial<Request> as Request,
      {} as Response,
      (err?: unknown) => {
        outcome = err;
      },
    );
    assert.equal(outcome, undefined);
  });
});

/** Controller-level checks with a stubbed request — exercises validation that runs before the service. */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

describe('enterprises controller guards', () => {
  it('rejects a non-numeric page before touching Prisma (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(enterprisesController.list, { query: { page: 'not-a-number' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects a pageSize over the 200 cap (Zod error)', async () => {
    const err = await invoke(enterprisesController.list, { query: { pageSize: '201' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
