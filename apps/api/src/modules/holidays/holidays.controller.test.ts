import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as holidaysController from './holidays.controller.js';

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 *  (holidays.routes.test.ts covers `list`'s guards already; this file covers create/update/remove). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

const ADMIN = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['hr-head'] };

describe('holidays controller guards', () => {
  it('create rejects a malformed date (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(holidaysController.create, {
      body: { date: '2026-02-30', name: 'Bad Date' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('create rejects a blank name (Zod error)', async () => {
    const err = await invoke(holidaysController.create, {
      body: { date: '2026-01-26', name: '   ' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('create forwards a TypeError to next() when req.user is missing (no service call reached)', async () => {
    const err = await invoke(holidaysController.create, { body: { date: '2026-01-26', name: 'Republic Day' } });
    assert.ok(err instanceof TypeError);
  });

  it('update rejects a body with neither date nor name (Zod refine error)', async () => {
    const err = await invoke(holidaysController.update, { body: {}, params: { id: 'h1' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update rejects a malformed date', async () => {
    const err = await invoke(holidaysController.update, {
      body: { date: 'not-a-date' },
      params: { id: 'h1' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('remove forwards a TypeError to next() when req.user is missing (no service call reached)', async () => {
    const err = await invoke(holidaysController.remove, { params: { id: 'h1' } });
    assert.ok(err instanceof TypeError);
  });
});
