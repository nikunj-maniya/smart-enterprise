import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as reportsController from './reports.controller.js';

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 *  (holidays.routes.test.ts / enterprises.controller.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

const VIEWER = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['hr-head'] };

describe('reports controller guards', () => {
  it('summary rejects a query missing "from"/"to" (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(reportsController.summary, { query: {}, user: VIEWER });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('summary forwards a TypeError to next() when req.user is missing (no service call reached)', async () => {
    const err = await invoke(reportsController.summary, { query: { from: '2026-06-01', to: '2026-06-30' } });
    assert.ok(err instanceof TypeError);
  });

  it('exportCsv rejects a query missing "from"/"to"', async () => {
    const err = await invoke(reportsController.exportCsv, { query: {}, user: VIEWER });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('exportCsv rejects a malformed "from"/"to" (Zod error) — guards the CSV filename header against injection', async () => {
    const err = await invoke(reportsController.exportCsv, {
      query: { from: '2026-06-01"; evil', to: '2026-06-30' },
      user: VIEWER,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('attendance rejects a malformed month (Zod error)', async () => {
    const err = await invoke(reportsController.attendance, { query: { month: '2026-6' }, user: VIEWER });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('attendance rejects a pageSize over the cap', async () => {
    const err = await invoke(reportsController.attendance, {
      query: { month: '2026-06', pageSize: '101' },
      user: VIEWER,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('attendanceExportCsv rejects a malformed month', async () => {
    const err = await invoke(reportsController.attendanceExportCsv, { query: { month: 'not-a-month' }, user: VIEWER });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
