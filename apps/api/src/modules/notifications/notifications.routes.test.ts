import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { notificationsRouter } from './notifications.routes.js';
import { errorHandler } from '../../middleware/error.js';
import { redisConnection } from '../../lib/redis.js';

// notifications.routes.js transitively imports the BullMQ `redisConnection` (via
// notifications.controller.js -> notifications.service.js -> slack-delivery.js), which connects
// eagerly (no lazyConnect) and retries indefinitely — left alone, that keeps this process alive
// with no live Redis in CI. Silence its connection errors and disconnect immediately so the test
// run can exit (front-desk.routes.test.ts pattern).
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/notifications', notificationsRouter);
  app.use(errorHandler);
  return app;
}

describe('notifications routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/notifications')).status, 401);
    assert.equal((await request(app).post('/notifications/n1/read')).status, 401);
    assert.equal((await request(app).post('/notifications/read-all')).status, 401);
  });
});
