import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import { registrationsRouter } from './registrations.routes.js';
import { requireSystemAdmin } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper behavior is covered by
 * registrations.service.test.ts's stubbed-Prisma suite, since CI has no database. `POST /` (public
 * submission) requires no token, so its pre-Prisma path is a Zod validation failure instead.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/registrations', registrationsRouter);
  app.use(errorHandler);
  return app;
}

describe('registrations routes (pre-DB behavior)', () => {
  it('rejects list/accept/reject without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/registrations')).status, 401);
    assert.equal((await request(app).post('/registrations/r1/accept')).status, 401);
    assert.equal((await request(app).post('/registrations/r1/reject').send({ reason: 'x' })).status, 401);
  });

  it('rejects a public submission with an incomplete body before touching Prisma (400)', async () => {
    const app = buildApp();
    const res = await request(app).post('/registrations').send({ companyName: 'Acme' });
    assert.equal(res.status, 400);
  });
});

/** This module's list/accept/reject are System-Admin (platform) only — no tenant role can reach them. */
describe('registrations requireSystemAdmin guard', () => {
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
