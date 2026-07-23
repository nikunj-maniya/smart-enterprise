import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import { slackConfigRouter } from './slack-config.routes.js';
import { requireEnterpriseAdmin } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper CRUD behavior is covered by
 * slack-config.service.test.ts (stubbed Prisma) and the Zod guards in
 * slack-config.controller.test.ts, since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/slack/config', slackConfigRouter);
  app.use(errorHandler);
  return app;
}

describe('slack-config routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/slack/config')).status, 401);
    assert.equal((await request(app).post('/slack/config/connect').send({})).status, 401);
    assert.equal((await request(app).post('/slack/config/disconnect')).status, 401);
    assert.equal((await request(app).post('/slack/config/test')).status, 401);
    assert.equal((await request(app).put('/slack/config/settings').send({})).status, 401);
  });
});

/** Enterprise Admin only (enterprise-profile.routes.test.ts pattern) — same shared middleware. */
describe('slack-config requireEnterpriseAdmin guard', () => {
  it('rejects a platform System Admin (no tenant) with 403', () => {
    let outcome: unknown;
    requireEnterpriseAdmin(
      { user: { id: 'u1', email: 'a@b.c', isSystemAdmin: true, tenantId: null, roles: [] } } as Partial<Request> as Request,
      {} as Response,
      (err?: unknown) => {
        outcome = err;
      },
    );
    assert.ok(outcome instanceof Error);
    assert.equal((outcome as { status?: number }).status, 403);
  });

  it('rejects a tenant user without the enterprise-admin role with 403', () => {
    let outcome: unknown;
    requireEnterpriseAdmin(
      { user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['employee'] } } as Partial<Request> as Request,
      {} as Response,
      (err?: unknown) => {
        outcome = err;
      },
    );
    assert.ok(outcome instanceof Error);
    assert.equal((outcome as { status?: number }).status, 403);
  });

  it('passes the tenant Enterprise Admin through', () => {
    let outcome: unknown;
    requireEnterpriseAdmin(
      { user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] } } as Partial<Request> as Request,
      {} as Response,
      (err?: unknown) => {
        outcome = err;
      },
    );
    assert.equal(outcome, undefined);
  });
});
