import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as escalationRulesController from './escalation-rules.controller.js';

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 *  reaches Prisma (item-catalog.controller.test.ts / holidays.routes.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

describe('escalation-rules requireEnterpriseAdmin guard', () => {
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

describe('escalation-rules controller guards', () => {
  it('list forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(escalationRulesController.list, {});
    assert.ok(err instanceof TypeError);
  });

  it('update rejects a missing toRoleId before touching Prisma (Zod error)', async () => {
    const err = await invoke(escalationRulesController.update, {
      params: { id: 'rule-1' },
      body: { actionWindowHours: 24 },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update rejects actionWindowHours below the 1-hour floor (Zod error)', async () => {
    const err = await invoke(escalationRulesController.update, {
      params: { id: 'rule-1' },
      body: { toRoleId: 'role-2', actionWindowHours: 0 },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update rejects actionWindowHours above the 720-hour (30-day) ceiling (Zod error)', async () => {
    const err = await invoke(escalationRulesController.update, {
      params: { id: 'rule-1' },
      body: { toRoleId: 'role-2', actionWindowHours: 721 },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update rejects a non-integer actionWindowHours (Zod error)', async () => {
    const err = await invoke(escalationRulesController.update, {
      params: { id: 'rule-1' },
      body: { toRoleId: 'role-2', actionWindowHours: 24.5 },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(escalationRulesController.update, {
      params: { id: 'rule-1' },
      body: { toRoleId: 'role-2', actionWindowHours: 24 },
    });
    assert.ok(err instanceof TypeError);
  });
});
