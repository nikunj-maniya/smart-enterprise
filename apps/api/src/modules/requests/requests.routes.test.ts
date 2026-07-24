import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { requestsRouter } from './requests.routes.js';
import { errorHandler } from '../../middleware/error.js';
import { redisConnection } from '../../lib/redis.js';

// requests.routes.js transitively imports the BullMQ `redisConnection` (via requests.service.js ->
// notifications.service.js -> slack-delivery.js), which connects eagerly and retries indefinitely
// — left alone, that keeps this process alive with no live Redis in CI. Silence its connection
// errors and disconnect immediately so the test run can exit (front-desk.routes.test.ts pattern).
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper request/approval-queue behavior is covered
 * by requests.service.test.ts's stubbed-Prisma suite, since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/requests', requestsRouter);
  app.use(errorHandler);
  return app;
}

describe('requests routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/requests')).status, 401);
    assert.equal((await request(app).get('/requests/approvals')).status, 401);
    assert.equal((await request(app).get('/requests/fulfilment-queue')).status, 401);
    assert.equal((await request(app).post('/requests').send({ formKey: 'leave', payload: {} })).status, 401);
    assert.equal((await request(app).get('/requests/r1')).status, 401);
    assert.equal((await request(app).post('/requests/r1/transitions').send({ toState: 'Approved' })).status, 401);
    assert.equal((await request(app).post('/requests/r1/decisions').send({ decision: 'approved' })).status, 401);
    assert.equal((await request(app).post('/requests/r1/claim')).status, 401);
  });
});
