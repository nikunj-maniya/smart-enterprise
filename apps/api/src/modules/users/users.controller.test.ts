import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as usersController from './users.controller.js';

/** Controller-level checks with a stubbed request — exercises Zod guards that run before the
 * service reaches Prisma (holidays.routes.test.ts / auth.controller.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

describe('users controller guards', () => {
  it('list rejects a pageSize over 100 before touching Prisma (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(usersController.list, { query: { pageSize: '101' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects an invalid status filter (Zod error)', async () => {
    const err = await invoke(usersController.list, { query: { status: 'not-a-status' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects a page below 1 (Zod error)', async () => {
    const err = await invoke(usersController.list, { query: { page: '0' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
