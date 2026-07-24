import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as leaveTypesController from './leave-types.controller.js';

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 *  (leave-types.routes.test.ts covers create/update Zod guards already; this file covers the
 *  remaining handlers — list, remove, and the absence-cap pair — plus the missing-user path). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

describe('leave-types controller guards', () => {
  it('list forwards a TypeError to next() when req.user is missing (no service call reached)', async () => {
    const err = await invoke(leaveTypesController.list, {});
    assert.ok(err instanceof TypeError);
  });

  it('getAbsenceCap forwards a TypeError to next() when req.user is missing', async () => {
    const err = await invoke(leaveTypesController.getAbsenceCap, {});
    assert.ok(err instanceof TypeError);
  });

  it('updateAbsenceCap rejects a non-integer cap (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(leaveTypesController.updateAbsenceCap, {
      body: { cap: 2.5 },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('updateAbsenceCap rejects a cap below 1 (Zod error)', async () => {
    const err = await invoke(leaveTypesController.updateAbsenceCap, {
      body: { cap: 0 },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('remove forwards a TypeError to next() when req.user is missing (no service call reached)', async () => {
    const err = await invoke(leaveTypesController.remove, { params: { id: 'lt1' } });
    assert.ok(err instanceof TypeError);
  });
});
