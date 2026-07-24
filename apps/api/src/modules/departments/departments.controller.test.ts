import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as departmentsController from './departments.controller.js';

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

const ADMIN = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: [] };

describe('departments controller guards', () => {
  it('list rejects a non-numeric page before calling the service (Zod error)', async () => {
    const err = await invoke(departmentsController.list, { query: { page: 'abc' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects a pageSize over the 100 cap (Zod error)', async () => {
    const err = await invoke(departmentsController.list, { query: { pageSize: '500' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(departmentsController.list, { query: {} });
    assert.ok(err instanceof TypeError);
  });

  it('create rejects a blank name before touching Prisma (Zod error)', async () => {
    const err = await invoke(departmentsController.create, { body: { name: '' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('create forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(departmentsController.create, { body: { name: 'Ops' } });
    assert.ok(err instanceof TypeError);
  });

  it('update rejects an empty name before touching Prisma (Zod error)', async () => {
    const err = await invoke(departmentsController.update, {
      body: { name: '' },
      params: { id: 'd1' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(departmentsController.update, { body: { name: 'Ops' }, params: { id: 'd1' } });
    assert.ok(err instanceof TypeError);
  });

  it('remove forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(departmentsController.remove, { params: { id: 'd1' } });
    assert.ok(err instanceof TypeError);
  });

  it('archive forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(departmentsController.archive, { params: { id: 'd1' }, path: '/departments/d1/archive' });
    assert.ok(err instanceof TypeError);
  });
});
