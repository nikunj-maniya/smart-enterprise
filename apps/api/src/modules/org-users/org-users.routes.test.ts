import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import { orgUsersRouter } from './org-users.routes.js';
import { requireEnterpriseAdmin, type AuthedUser } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/error.js';
import { HttpError } from '../../lib/http-error.js';

/**
 * Real router + error handler on a throwaway app (auth.routes.test.ts / holidays.routes.test.ts
 * pattern). Only paths that reject before any Prisma call run here — deeper CRUD behavior is
 * covered by org-users.service.test.ts's stubbed-Prisma suite, since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/org-users', orgUsersRouter);
  app.use(errorHandler);
  return app;
}

describe('org-users routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/org-users')).status, 401);
    assert.equal((await request(app).get('/org-users/options')).status, 401);
    assert.equal((await request(app).get('/org-users/stats')).status, 401);
    assert.equal((await request(app).post('/org-users').send({})).status, 401);
    assert.equal((await request(app).put('/org-users/u1').send({})).status, 401);
    assert.equal((await request(app).delete('/org-users/u1')).status, 401);
    assert.equal((await request(app).post('/org-users/u1/deactivate')).status, 401);
    assert.equal((await request(app).post('/org-users/u1/reactivate')).status, 401);
    assert.equal((await request(app).post('/org-users/u1/approve')).status, 401);
    assert.equal((await request(app).post('/org-users/u1/reject')).status, 401);
    assert.equal((await request(app).post('/org-users/u1/reset-password')).status, 401);
  });
});

/** Drives requireEnterpriseAdmin with a stubbed req/next — no HTTP, no DB (require-any-role.test.ts pattern). */
function runGuard(user: Partial<AuthedUser> | undefined) {
  let outcome: unknown;
  requireEnterpriseAdmin({ user } as Request, {} as Response, (err?: unknown) => {
    outcome = err;
  });
  return outcome;
}

describe('requireEnterpriseAdmin (org-users guard)', () => {
  it('rejects a platform System Admin (no tenant) with 403', () => {
    const err = runGuard({ id: 'u1', email: 'a@b.c', isSystemAdmin: true, tenantId: null, roles: [] });
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 403);
  });

  it('rejects a tenant user without the enterprise-admin role', () => {
    const err = runGuard({ id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['employee'] });
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 403);
  });

  it('passes a tenant user holding the enterprise-admin role', () => {
    const err = runGuard({ id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] });
    assert.equal(err, undefined);
  });
});
