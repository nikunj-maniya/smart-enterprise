import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { SystemRoleKey } from '@se/shared';
import { departmentsRouter } from './departments.routes.js';
import * as departmentsController from './departments.controller.js';
import { requireAnyRole, requireEnterpriseAdmin, type AuthedUser } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/error.js';
import { HttpError } from '../../lib/http-error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper CRUD behavior is covered by
 * departments.service.test.ts's stubbed-Prisma suite, since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/departments', departmentsRouter);
  app.use(errorHandler);
  return app;
}

describe('departments routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/departments')).status, 401);
    assert.equal((await request(app).post('/departments').send({ name: 'Eng' })).status, 401);
    assert.equal((await request(app).put('/departments/d1').send({ name: 'Eng' })).status, 401);
    assert.equal((await request(app).delete('/departments/d1')).status, 401);
    assert.equal((await request(app).post('/departments/d1/archive')).status, 401);
    assert.equal((await request(app).post('/departments/d1/unarchive')).status, 401);
  });
});

/** Drives a guard middleware with a stubbed req/next — no HTTP, no DB (auth.test.ts's scope). */
function runGuard(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  user: Partial<AuthedUser> | undefined,
): HttpError | undefined | 'passed' {
  let outcome: HttpError | undefined | 'passed';
  middleware({ user } as Request, {} as Response, (err?: unknown) => {
    outcome = err === undefined ? 'passed' : (err as HttpError);
  });
  return outcome;
}

// Mirrors departments.routes.ts's ABSENCE_VIEWER_ROLES (not exported).
const ABSENCE_VIEWER_ROLES = [
  SystemRoleKey.EnterpriseAdmin,
  SystemRoleKey.HrHead,
  SystemRoleKey.ProjectManager,
  SystemRoleKey.TechLead,
];

describe('departments route guards', () => {
  it('requireAnyRole(ABSENCE_VIEWER_ROLES) rejects an employee (403)', () => {
    const outcome = runGuard(requireAnyRole(ABSENCE_VIEWER_ROLES), {
      tenantId: 't1',
      roles: [SystemRoleKey.Employee],
    });
    assert.ok(outcome instanceof HttpError);
    assert.equal(outcome.status, 403);
  });

  it('requireAnyRole(ABSENCE_VIEWER_ROLES) passes a Tech Lead', () => {
    const outcome = runGuard(requireAnyRole(ABSENCE_VIEWER_ROLES), {
      tenantId: 't1',
      roles: [SystemRoleKey.TechLead],
    });
    assert.equal(outcome, 'passed');
  });

  it('requireEnterpriseAdmin rejects a non-admin tenant user before create/update/delete/archive (403)', () => {
    const outcome = runGuard(requireEnterpriseAdmin, { tenantId: 't1', roles: [SystemRoleKey.HrHead] });
    assert.ok(outcome instanceof HttpError);
    assert.equal(outcome.status, 403);
  });

  it('requireEnterpriseAdmin passes an Enterprise Admin', () => {
    const outcome = runGuard(requireEnterpriseAdmin, { tenantId: 't1', roles: [SystemRoleKey.EnterpriseAdmin] });
    assert.equal(outcome, 'passed');
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

const ADMIN = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: [SystemRoleKey.EnterpriseAdmin] };

describe('departments controller guards', () => {
  it('rejects a list query with a non-numeric page (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(departmentsController.list, { query: { page: 'abc' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects a list query with a pageSize over the max of 100 (Zod error)', async () => {
    const err = await invoke(departmentsController.list, { query: { pageSize: '500' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects a create body with a blank name before touching Prisma (Zod error)', async () => {
    const err = await invoke(departmentsController.create, { body: { name: '' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects an update body with an empty name (Zod error)', async () => {
    const err = await invoke(departmentsController.update, {
      body: { name: '' },
      params: { id: 'd1' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
