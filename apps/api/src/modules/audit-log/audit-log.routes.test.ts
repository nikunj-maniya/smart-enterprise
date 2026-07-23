import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { auditLogRouter } from './audit-log.routes.js';
import * as auditLogController from './audit-log.controller.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper behavior is covered by
 * audit-log.service.test.ts (stubbed Prisma), since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use('/audit-log', auditLogRouter);
  app.use(errorHandler);
  return app;
}

describe('audit-log routes (pre-DB behavior)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    assert.equal((await request(buildApp()).get('/audit-log')).status, 401);
  });
});

/** Controller-level checks with a stubbed request — exercises Zod validation before any service call. */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

describe('audit-log controller guards', () => {
  it('rejects a non-numeric page before calling the service (Zod error)', async () => {
    const err = await invoke(auditLogController.list, { query: { page: 'not-a-number' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects a pageSize over the 100 cap before calling the service (Zod error)', async () => {
    const err = await invoke(auditLogController.list, { query: { pageSize: '101' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('rejects an unrecognized action value before calling the service (Zod error)', async () => {
    const err = await invoke(auditLogController.list, { query: { action: 'not-a-real-action' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
