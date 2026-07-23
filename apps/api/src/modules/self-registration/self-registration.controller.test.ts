import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as selfRegistrationController from './self-registration.controller.js';

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

const ADMIN = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] };

describe('self-registration controller guards', () => {
  it('getLink forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(selfRegistrationController.getLink, {});
    assert.ok(err instanceof TypeError);
  });

  it('generate rejects an expiryMinutes below the 5-minute floor (Zod error)', async () => {
    const err = await invoke(selfRegistrationController.generate, { body: { expiryMinutes: 1 }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('generate rejects an expiryMinutes above the 10080-minute (7-day) ceiling (Zod error)', async () => {
    const err = await invoke(selfRegistrationController.generate, { body: { expiryMinutes: 10081 }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('generate forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(selfRegistrationController.generate, { body: { expiryMinutes: 60 } });
    assert.ok(err instanceof TypeError);
  });

  it('revoke forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(selfRegistrationController.revoke, {});
    assert.ok(err instanceof TypeError);
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
