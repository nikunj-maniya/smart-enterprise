import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as directoryController from './directory.controller.js';

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

const USER = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: [] };

describe('directory controller guards', () => {
  it('users rejects a limit over the max of 50 (Zod error)', async () => {
    const err = await invoke(directoryController.users, { query: { limit: '999' }, user: USER });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('users forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(directoryController.users, { query: {} });
    assert.ok(err instanceof TypeError);
  });

  it('projects rejects a limit of 0 (below the min of 1)', async () => {
    const err = await invoke(directoryController.projects, { query: { limit: '0' }, user: USER });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('projects forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(directoryController.projects, { query: {} });
    assert.ok(err instanceof TypeError);
  });
});
