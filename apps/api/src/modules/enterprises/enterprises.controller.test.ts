import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import * as enterprisesController from './enterprises.controller.js';

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

describe('enterprises controller guards', () => {
  it('list rejects a non-numeric page before calling the service (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(enterprisesController.list, { query: { page: 'not-a-number' } });
    assert.ok(err instanceof ZodError);
  });

  it('list rejects a pageSize over the 200 cap before calling the service', async () => {
    const err = await invoke(enterprisesController.list, { query: { pageSize: '201' } });
    assert.ok(err instanceof ZodError);
  });

  it('list rejects an unrecognized status value before calling the service', async () => {
    const err = await invoke(enterprisesController.list, { query: { status: 'not-a-status' } });
    assert.ok(err instanceof ZodError);
  });

  it('suspend forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(enterprisesController.suspend, { params: { id: 't1' } });
    assert.ok(err instanceof TypeError);
  });

  it('reactivate forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(enterprisesController.reactivate, { params: { id: 't1' } });
    assert.ok(err instanceof TypeError);
  });
});
