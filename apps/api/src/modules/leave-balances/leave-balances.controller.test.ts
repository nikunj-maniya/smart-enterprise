import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as leaveBalancesController from './leave-balances.controller.js';

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 *  reaches Prisma (auth.controller.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

describe('leave-balances controller guards', () => {
  it('me forwards a synchronous error to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(leaveBalancesController.me, {});
    assert.ok(err instanceof TypeError);
  });
});
