import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as orgUsersController from './org-users.controller.js';

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

const ADMIN = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] };

describe('org-users controller guards', () => {
  it('list rejects a pageSize over 100 before touching Prisma (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(orgUsersController.list, { query: { pageSize: '101' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects an invalid status filter (Zod error)', async () => {
    const err = await invoke(orgUsersController.list, { query: { status: 'not-a-status' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('create rejects a blank name (Zod error)', async () => {
    const err = await invoke(orgUsersController.create, {
      body: { name: '', email: 'a@b.c', password: 'password123', roleIds: [], departmentIds: [] },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('create rejects an invalid email (Zod error)', async () => {
    const err = await invoke(orgUsersController.create, {
      body: { name: 'Asha', email: 'not-an-email', password: 'password123', roleIds: [], departmentIds: [] },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('create rejects a password under 8 characters (Zod error)', async () => {
    const err = await invoke(orgUsersController.create, {
      body: { name: 'Asha', email: 'a@b.c', password: 'short', roleIds: [], departmentIds: [] },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update rejects a blank name (Zod error)', async () => {
    const err = await invoke(orgUsersController.update, {
      body: { name: '', roleIds: [], departmentIds: [] },
      params: { id: 'u2' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
