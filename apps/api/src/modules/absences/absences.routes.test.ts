import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { absencesRouter } from './absences.routes.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper scoped/field-shaping behavior is covered
 * by absences.service.test.ts's stubbed-Prisma suite, since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use('/absences', absencesRouter);
  app.use(errorHandler);
  return app;
}

describe('absences routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/absences?from=2026-06-01&to=2026-06-30')).status, 401);
    assert.equal((await request(app).get('/absences/over-cap?from=2026-06-01&to=2026-06-30')).status, 401);
  });
});
