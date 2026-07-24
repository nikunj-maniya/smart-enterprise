import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { escalationRulesRouter } from './escalation-rules.routes.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (item-catalog.routes.test.ts / holidays.routes.test.ts
 * pattern). Only paths that reject before any Prisma call run here — deeper CRUD behavior is covered
 * by escalation-rules.service.test.ts (stubbed Prisma) and the requireEnterpriseAdmin guard / Zod
 * checks by escalation-rules.controller.test.ts, since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/escalation-rules', escalationRulesRouter);
  app.use(errorHandler);
  return app;
}

describe('escalation-rules routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/escalation-rules')).status, 401);
    assert.equal(
      (await request(app).put('/escalation-rules/abc').send({ toRoleId: 'r1', actionWindowHours: 24 })).status,
      401,
    );
  });
});
