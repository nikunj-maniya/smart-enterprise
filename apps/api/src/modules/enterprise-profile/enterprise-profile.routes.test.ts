import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { enterpriseProfileRouter } from './enterprise-profile.routes.js';
import * as enterpriseProfileController from './enterprise-profile.controller.js';
import { requireEnterpriseAdmin } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper CRUD behavior is covered by
 * enterprise-profile.service.test.ts (stubbed Prisma) and the scripted verification pass, since
 * CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/enterprise-profile', enterpriseProfileRouter);
  app.use(errorHandler);
  return app;
}

describe('enterprise-profile routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/enterprise-profile')).status, 401);
    assert.equal((await request(app).put('/enterprise-profile').send({ name: 'X' })).status, 401);
  });
});

/** Self-service only — System Admin (no tenant) and tenant users without the role are rejected. */
describe('enterprise-profile requireEnterpriseAdmin guard', () => {
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

/** Controller-level checks with a stubbed request — exercises validation that runs before the service. */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

describe('enterprise-profile controller guards', () => {
  it('rejects a blank company name before touching Prisma (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(enterpriseProfileController.update, {
      body: { name: '' },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects a body missing the required name field (Zod error)', async () => {
    const err = await invoke(enterpriseProfileController.update, {
      body: { industry: 'Finance' },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
