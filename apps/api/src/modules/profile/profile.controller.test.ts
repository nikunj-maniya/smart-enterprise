import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as profileController from './profile.controller.js';

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 * reaches Prisma (holidays.routes.test.ts / org-users.controller.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

const USER = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: [] };

describe('profile controller guards', () => {
  it('update rejects a blank name before calling the service (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(profileController.update, { body: { name: '' }, user: USER });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('updateNotificationPreference rejects an unrecognized channel before calling the service', async () => {
    const err = await invoke(profileController.updateNotificationPreference, {
      body: { type: 'leave_submitted', channel: 'sms', enabled: true },
      user: USER,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('get forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(profileController.get, {});
    assert.ok(err instanceof TypeError);
  });

  it('update forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(profileController.update, { body: { name: 'X' } });
    assert.ok(err instanceof TypeError);
  });
});
