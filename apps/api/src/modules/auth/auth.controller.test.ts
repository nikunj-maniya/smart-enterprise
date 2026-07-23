import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import * as authController from './auth.controller.js';

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 * reaches Prisma (holidays.routes.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, { json: () => undefined } as unknown as Response, (err?: unknown) =>
      resolve(err),
    );
  });
}

describe('auth controller guards', () => {
  it('login rejects an invalid body before calling the service (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(authController.login, { body: { email: 'nope', password: '' } });
    assert.ok(err instanceof ZodError);
  });

  it('changePassword rejects a too-short new password before calling the service', async () => {
    const err = await invoke(authController.changePassword, {
      body: { currentPassword: 'x', newPassword: 'short' },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: [] },
    });
    assert.ok(err instanceof ZodError);
  });

  it('forgotPassword rejects an invalid email before calling the service', async () => {
    const err = await invoke(authController.forgotPassword, { body: { email: 'nope' } });
    assert.ok(err instanceof ZodError);
  });

  it('resetPassword rejects a missing token before calling the service', async () => {
    const err = await invoke(authController.resetPassword, { body: { newPassword: 'longenough' } });
    assert.ok(err instanceof ZodError);
  });

  it('refresh rejects a missing refreshToken with a 400 HttpError before calling the service', async () => {
    const err = await invoke(authController.refresh, { body: {} });
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 400);
    assert.equal(err.message, 'refreshToken is required');
  });

  it('refresh rejects a malformed refreshToken with 401 (verifyRefreshToken throws before any Prisma call)', async () => {
    const err = await invoke(authController.refresh, { body: { refreshToken: 'not-a-real-jwt' } });
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 401);
  });

  it('me forwards a synchronous error to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(authController.me, {});
    assert.ok(err instanceof TypeError);
  });
});
