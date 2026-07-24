import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as searchController from './search.controller.js';

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

describe('search controller guards', () => {
  it('rejects a missing q param before calling the service (Zod error)', async () => {
    const err = await invoke(searchController.search, { query: {} });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects an empty q param before calling the service (Zod error)', async () => {
    const err = await invoke(searchController.search, { query: { q: '' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(searchController.search, { query: { q: 'jane' } });
    assert.ok(err instanceof TypeError);
  });
});
