import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { profileRouter } from './profile.routes.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (holidays.routes.test.ts pattern). Only paths
 * that reject before any Prisma call run here — deeper behavior is covered by
 * profile.service.test.ts's stubbed-Prisma suite, since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/profile', profileRouter);
  app.use(errorHandler);
  return app;
}

describe('profile routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/profile')).status, 401);
    assert.equal((await request(app).put('/profile').send({ name: 'X' })).status, 401);
    assert.equal((await request(app).get('/profile/notification-preferences')).status, 401);
    assert.equal(
      (
        await request(app)
          .put('/profile/notification-preferences')
          .send({ type: 'leave_submitted', channel: 'inApp', enabled: true })
      ).status,
      401,
    );
  });
});
