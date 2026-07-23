import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { reportsRouter } from './reports.routes.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper behavior (incl. the attendance routes'
 * Finance/EnterpriseAdmin role gate) is covered by reports.controller.test.ts / attendance.service.test.ts,
 * since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use('/reports', reportsRouter);
  app.use(errorHandler);
  return app;
}

describe('reports routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/reports/summary?from=2026-06-01&to=2026-06-30')).status, 401);
    assert.equal((await request(app).get('/reports/export?from=2026-06-01&to=2026-06-30')).status, 401);
    assert.equal((await request(app).get('/reports/attendance?from=2026-06-01&to=2026-06-30')).status, 401);
    assert.equal((await request(app).get('/reports/attendance/export?from=2026-06-01&to=2026-06-30')).status, 401);
  });
});
