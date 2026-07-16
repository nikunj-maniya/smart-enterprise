import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { SystemRoleKey } from '@se/shared';
import { requireAnyRole, type AuthedUser } from './auth.js';
import { HttpError } from '../lib/http-error.js';

/** Drives the middleware with a stubbed req/next — no HTTP, no DB (matches auth.test.ts's scope). */
function run(user: Partial<AuthedUser> | undefined, roles: string[]): HttpError | undefined | 'passed' {
  const middleware = requireAnyRole(roles);
  let outcome: HttpError | undefined | 'passed';
  middleware(
    { user } as Request,
    {} as Response,
    (err?: unknown) => {
      outcome = err === undefined ? 'passed' : (err as HttpError);
    },
  );
  return outcome;
}

const ATTENDANCE_ROLES = [SystemRoleKey.Finance, SystemRoleKey.EnterpriseAdmin];

describe('requireAnyRole (attendance/holiday gating)', () => {
  it('rejects an unauthenticated request', () => {
    const outcome = run(undefined, ATTENDANCE_ROLES);
    assert.ok(outcome instanceof HttpError);
    assert.equal(outcome.status, 403);
  });

  it('rejects a platform admin with no tenant even if roles matched', () => {
    const outcome = run({ tenantId: null, roles: [SystemRoleKey.Finance] }, ATTENDANCE_ROLES);
    assert.ok(outcome instanceof HttpError);
    assert.equal(outcome.status, 403);
  });

  it('rejects tenant users without a matching role (employee, hr-head, pm, tech-lead)', () => {
    for (const role of [
      SystemRoleKey.Employee,
      SystemRoleKey.HrHead,
      SystemRoleKey.ProjectManager,
      SystemRoleKey.TechLead,
    ]) {
      const outcome = run({ tenantId: 't1', roles: [role] }, ATTENDANCE_ROLES);
      assert.ok(outcome instanceof HttpError, role);
      assert.equal(outcome.status, 403, role);
    }
  });

  it('passes finance and enterprise-admin holders', () => {
    assert.equal(run({ tenantId: 't1', roles: [SystemRoleKey.Finance] }, ATTENDANCE_ROLES), 'passed');
    assert.equal(run({ tenantId: 't1', roles: [SystemRoleKey.EnterpriseAdmin] }, ATTENDANCE_ROLES), 'passed');
  });

  it('passes a multi-role user where any role matches', () => {
    const outcome = run(
      { tenantId: 't1', roles: [SystemRoleKey.Employee, SystemRoleKey.Finance] },
      ATTENDANCE_ROLES,
    );
    assert.equal(outcome, 'passed');
  });
});
