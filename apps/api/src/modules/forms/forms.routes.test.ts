import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { formsRouter } from './forms.routes.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper CRUD/builder behavior is covered by
 * forms.service.test.ts's stubbed-Prisma suite, since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/forms', formsRouter);
  app.use(errorHandler);
  return app;
}

describe('forms routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/forms')).status, 401);
    assert.equal((await request(app).get('/forms/leave')).status, 401);
    assert.equal((await request(app).post('/forms/leave/publish').send({ title: 'Leave', sections: [] })).status, 401);
    assert.equal((await request(app).get('/forms/drafts')).status, 401);
    assert.equal((await request(app).post('/forms/drafts').send({ title: 'X' })).status, 401);
    assert.equal((await request(app).get('/forms/drafts/leave')).status, 401);
    assert.equal((await request(app).put('/forms/drafts/leave').send({ fields: [] })).status, 401);
    assert.equal((await request(app).put('/forms/drafts/leave/routing').send({ mode: 'any', stageRules: [] })).status, 401);
    assert.equal((await request(app).put('/forms/drafts/leave/status-model').send({ states: [], transitions: [] })).status, 401);
    assert.equal((await request(app).post('/forms/drafts/leave/publish')).status, 401);
    assert.equal((await request(app).post('/forms/drafts/leave/start')).status, 401);
  });
});
