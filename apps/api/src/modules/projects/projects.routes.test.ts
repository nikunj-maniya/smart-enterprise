import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { SystemRoleKey } from '@se/shared';
import { projectsRouter } from './projects.routes.js';
import { requireAnyRole, requireEnterpriseAdmin, type AuthedUser } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/error.js';
import { HttpError } from '../../lib/http-error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper CRUD behavior is covered by
 * projects.service.test.ts's stubbed-Prisma suite, since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/projects', projectsRouter);
  app.use(errorHandler);
  return app;
}

describe('projects routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/projects')).status, 401);
    assert.equal((await request(app).post('/projects').send({ name: 'X' })).status, 401);
    assert.equal((await request(app).put('/projects/p1').send({ name: 'X' })).status, 401);
    assert.equal((await request(app).delete('/projects/p1')).status, 401);
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

// Mirrors projects.routes.ts's ABSENCE_VIEWER_ROLES (not exported).
const ABSENCE_VIEWER_ROLES = [
  SystemRoleKey.EnterpriseAdmin,
  SystemRoleKey.HrHead,
  SystemRoleKey.ProjectManager,
  SystemRoleKey.TechLead,
];

describe('projects route guards', () => {
  it('requireAnyRole(ABSENCE_VIEWER_ROLES) rejects an employee (403)', () => {
    const outcome = runGuard(requireAnyRole(ABSENCE_VIEWER_ROLES), {
      tenantId: 't1',
      roles: [SystemRoleKey.Employee],
    });
    assert.ok(outcome instanceof HttpError);
    assert.equal(outcome.status, 403);
  });

  it('requireAnyRole(ABSENCE_VIEWER_ROLES) passes a Project Manager', () => {
    const outcome = runGuard(requireAnyRole(ABSENCE_VIEWER_ROLES), {
      tenantId: 't1',
      roles: [SystemRoleKey.ProjectManager],
    });
    assert.equal(outcome, 'passed');
  });

  it('requireEnterpriseAdmin rejects a non-admin tenant user before create/update/delete (403)', () => {
    const outcome = runGuard(requireEnterpriseAdmin, { tenantId: 't1', roles: [SystemRoleKey.TechLead] });
    assert.ok(outcome instanceof HttpError);
    assert.equal(outcome.status, 403);
  });

  it('requireEnterpriseAdmin passes an Enterprise Admin', () => {
    const outcome = runGuard(requireEnterpriseAdmin, { tenantId: 't1', roles: [SystemRoleKey.EnterpriseAdmin] });
    assert.equal(outcome, 'passed');
  });
});
