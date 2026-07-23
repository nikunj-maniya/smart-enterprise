import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { selfRegistrationRouter, publicSelfRegistrationRouter } from './self-registration.routes.js';
import * as selfRegistrationController from './self-registration.controller.js';
import { requireEnterpriseAdmin } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper behavior is covered by
 * self-registration.service.test.ts (stubbed Prisma), since CI has no database. The public
 * router isn't mounted against a live app here: both its handlers reach Prisma immediately with
 * no auth guard in front, so there's no pre-DB rejection path to exercise at that layer.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/self-registration', selfRegistrationRouter);
  app.use('/public/self-registration', publicSelfRegistrationRouter);
  app.use(errorHandler);
  return app;
}

describe('self-registration admin routes (pre-DB behavior)', () => {
  it('rejects every admin route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/self-registration')).status, 401);
    assert.equal((await request(app).post('/self-registration').send({})).status, 401);
    assert.equal((await request(app).delete('/self-registration')).status, 401);
  });
});

describe('self-registration requireEnterpriseAdmin guard', () => {
  it('rejects a tenant user without the Enterprise Admin role with 403', () => {
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

  it('passes a tenant Enterprise Admin through', () => {
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

/** Controller-level checks with a stubbed request — exercises Zod validation before any service call. */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

describe('self-registration controller guards', () => {
  it('generate rejects an expiryMinutes below the 5-minute floor (Zod error)', async () => {
    const err = await invoke(selfRegistrationController.generate, {
      body: { expiryMinutes: 1 },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('generate rejects an expiryMinutes above the 10080-minute (7-day) ceiling (Zod error)', async () => {
    const err = await invoke(selfRegistrationController.generate, {
      body: { expiryMinutes: 10081 },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('publicRegister rejects a missing email before touching Prisma (Zod error)', async () => {
    const err = await invoke(selfRegistrationController.publicRegister, {
      params: { token: 'tok' },
      body: { name: 'Alice', password: 'longenough1' },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('publicRegister rejects a too-short password before touching Prisma (Zod error)', async () => {
    const err = await invoke(selfRegistrationController.publicRegister, {
      params: { token: 'tok' },
      body: { name: 'Alice', email: 'alice@example.com', password: 'short' },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
