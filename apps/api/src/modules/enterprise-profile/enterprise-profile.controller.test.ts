import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import * as enterpriseProfileController from './enterprise-profile.controller.js';

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

describe('enterprise-profile controller guards', () => {
  it('get forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(enterpriseProfileController.get, {});
    assert.ok(err instanceof TypeError);
  });

  it('update rejects a blank company name before touching req.user or Prisma (Zod error)', async () => {
    const err = await invoke(enterpriseProfileController.update, { body: { name: '' } });
    assert.ok(err instanceof ZodError);
  });

  it('update rejects a body missing the required name field (Zod error)', async () => {
    const err = await invoke(enterpriseProfileController.update, { body: { industry: 'Finance' } });
    assert.ok(err instanceof ZodError);
  });

  it('update forwards a TypeError to next() when req.user is missing but the body is valid (no Prisma call reached)', async () => {
    const err = await invoke(enterpriseProfileController.update, { body: { name: 'Acme Corp' } });
    assert.ok(err instanceof TypeError);
  });
});
