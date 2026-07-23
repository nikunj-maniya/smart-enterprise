import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import { overviewRouter } from './overview.routes.js';
import { requireSystemAdmin } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only the
 * pre-DB rejection path runs here — the aggregation itself is covered by
 * overview.service.test.ts (stubbed Prisma), since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use('/overview', overviewRouter);
  app.use(errorHandler);
  return app;
}

describe('overview routes (pre-DB behavior)', () => {
  it('rejects the route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/overview')).status, 401);
  });
});

/** This module is System-Admin (platform) only — no tenant-scoped role can reach it. */
describe('overview requireSystemAdmin guard', () => {
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
