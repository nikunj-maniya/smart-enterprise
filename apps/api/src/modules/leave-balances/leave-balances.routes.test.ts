import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { leaveBalancesRouter } from './leave-balances.routes.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper behavior is covered by
 * leave-balances.service.test.ts (stubbed Prisma), since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use('/leave-balances', leaveBalancesRouter);
  app.use(errorHandler);
  return app;
}

describe('leave-balances routes (pre-DB behavior)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    assert.equal((await request(buildApp()).get('/leave-balances/me')).status, 401);
  });
});
