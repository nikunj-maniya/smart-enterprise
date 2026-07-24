import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { searchRouter } from './search.routes.js';
import * as searchController from './search.controller.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — per-searcher aggregation is covered by
 * search.searchers.test.ts / search.service.test.ts (stubbed Prisma), since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use('/search', searchRouter);
  app.use(errorHandler);
  return app;
}

describe('search routes (pre-DB behavior)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    assert.equal((await request(buildApp()).get('/search?q=x')).status, 401);
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
});
