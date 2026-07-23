import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as auditLogController from './audit-log.controller.js';

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

describe('audit-log controller guards', () => {
  it('list rejects a non-numeric page before calling the service (Zod error)', async () => {
    const err = await invoke(auditLogController.list, { query: { page: 'not-a-number' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects a pageSize over the 100 cap before calling the service (Zod error)', async () => {
    const err = await invoke(auditLogController.list, { query: { pageSize: '101' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects an unrecognized action value before calling the service (Zod error)', async () => {
    const err = await invoke(auditLogController.list, { query: { action: 'not-a-real-action' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
