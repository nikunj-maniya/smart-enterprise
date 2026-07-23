import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { SystemRoleKey } from '@se/shared';
import * as projectsController from './projects.controller.js';

/** Controller-level checks with a stubbed request — exercises Zod guards that run before the
 * service reaches Prisma (holidays.routes.test.ts / org-users.controller.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

const ADMIN = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: [SystemRoleKey.EnterpriseAdmin] };

describe('projects controller guards', () => {
  it('list rejects a non-numeric page (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(projectsController.list, { query: { page: 'abc' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects a pageSize over the max of 100 (Zod error)', async () => {
    const err = await invoke(projectsController.list, { query: { pageSize: '500' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects an unrecognized status value', async () => {
    const err = await invoke(projectsController.list, { query: { status: 'not-a-status' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('create rejects a blank name before touching Prisma (Zod error)', async () => {
    const err = await invoke(projectsController.create, { body: { name: '' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update rejects a blank name before touching Prisma (Zod error)', async () => {
    const err = await invoke(projectsController.update, {
      body: { name: '' },
      params: { id: 'p1' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
