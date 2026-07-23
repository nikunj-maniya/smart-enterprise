import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as rolesController from './roles.controller.js';

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

describe('roles controller guards', () => {
  it('list rejects a pageSize over 100 before touching Prisma (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(rolesController.list, { query: { pageSize: '101' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects an invalid type filter (Zod error)', async () => {
    const err = await invoke(rolesController.list, { query: { type: 'not-a-type' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('create rejects a blank name (Zod error)', async () => {
    const err = await invoke(rolesController.create, {
      body: { name: '', permissions: [] },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('create rejects an unknown permission key (Zod error)', async () => {
    const err = await invoke(rolesController.create, {
      body: { name: 'Custom Role', permissions: ['not-a-real-permission'] },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update rejects a blank name (Zod error)', async () => {
    const err = await invoke(rolesController.update, {
      body: { name: '', permissions: [] },
      params: { id: 'r1' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
