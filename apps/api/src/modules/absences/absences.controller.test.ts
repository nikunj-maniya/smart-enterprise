import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as absencesController from './absences.controller.js';

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 *  (holidays.routes.test.ts / enterprises.controller.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

const VIEWER = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['hr-head'] };

describe('absences controller guards', () => {
  it('list rejects a query missing "from"/"to" (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(absencesController.list, { query: {}, user: VIEWER });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects an unrecognized "type" value before touching the service', async () => {
    const err = await invoke(absencesController.list, {
      query: { from: '2026-06-01', to: '2026-06-30', type: 'sick' },
      user: VIEWER,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list forwards a TypeError to next() when req.user is missing (no service call reached)', async () => {
    const err = await invoke(absencesController.list, { query: { from: '2026-06-01', to: '2026-06-30' } });
    assert.ok(err instanceof TypeError);
  });

  it('overCap rejects a query missing "from"/"to" (Zod error)', async () => {
    const err = await invoke(absencesController.overCap, { query: {}, user: VIEWER });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('overCap forwards a TypeError to next() when req.user is missing (no service call reached)', async () => {
    const err = await invoke(absencesController.overCap, { query: { from: '2026-06-01', to: '2026-06-30' } });
    assert.ok(err instanceof TypeError);
  });
});
