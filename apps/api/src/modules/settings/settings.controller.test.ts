import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as settingsController from './settings.controller.js';

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 * reaches Prisma (auth.controller.test.ts / holidays.routes.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

const SYSTEM_ADMIN = { id: 'u1', email: 'a@b.c', isSystemAdmin: true, tenantId: null, roles: [] };

describe('settings controller guards', () => {
  it('update rejects a non-boolean field before calling the service (Zod error)', async () => {
    const err = await invoke(settingsController.update, {
      body: { allowPublicRegistration: 'yes' },
      user: SYSTEM_ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update rejects a wrong-typed known field before calling the service (Zod error)', async () => {
    const err = await invoke(settingsController.update, {
      body: { notifyOnNewRegistration: 1 },
      user: SYSTEM_ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(settingsController.update, { body: { allowPublicRegistration: true } });
    assert.ok(err instanceof TypeError);
  });
});
