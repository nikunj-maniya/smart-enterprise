import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import { usersRouter } from './users.routes.js';
import { requireSystemAdmin, type AuthedUser } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/error.js';
import { HttpError } from '../../lib/http-error.js';

/**
 * Real router + error handler on a throwaway app (auth.routes.test.ts / holidays.routes.test.ts
 * pattern). Only paths that reject before any Prisma call run here — deeper behavior (listing,
 * password reset) is covered by users.service.test.ts's stubbed-Prisma suite, since CI has no
 * database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', usersRouter);
  app.use(errorHandler);
  return app;
}

describe('users routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/users')).status, 401);
    assert.equal((await request(app).post('/users/u1/reset-password')).status, 401);
  });
});

/** Drives requireSystemAdmin with a stubbed req/next — no HTTP, no DB (require-any-role.test.ts pattern). */
function runGuard(user: Partial<AuthedUser>) {
  let outcome: unknown;
  requireSystemAdmin({ user } as Request, {} as Response, (err?: unknown) => {
    outcome = err;
  });
  return outcome;
}

describe('requireSystemAdmin (users guard)', () => {
  it('rejects a tenant user, even an Enterprise Admin, with 403', () => {
    const err = runGuard({ id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] });
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 403);
  });

  it('passes the platform System Admin', () => {
    const err = runGuard({ id: 'u1', email: 'a@b.c', isSystemAdmin: true, tenantId: null, roles: [] });
    assert.equal(err, undefined);
  });
});
