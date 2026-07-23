import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { authRouter } from './auth.routes.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (auth.test.ts / holidays.routes.test.ts pattern).
 * Only paths that reject before any Prisma call run here — CI has no database, so valid-body
 * login/forgot-password/reset-password submissions (which would reach prisma.user.findUnique) are
 * left to the scripted verification pass against the dedicated test DB.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use(errorHandler);
  return app;
}

describe('auth routes (pre-DB behavior)', () => {
  it('rejects login with an invalid email and empty password (400 via Zod)', async () => {
    const res = await request(buildApp()).post('/auth/login').send({ email: 'not-an-email', password: '' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Validation failed');
  });

  it('rejects forgot-password with an invalid email (400 via Zod)', async () => {
    const res = await request(buildApp()).post('/auth/forgot-password').send({ email: 'not-an-email' });
    assert.equal(res.status, 400);
  });

  it('rejects reset-password with a missing token and a too-short new password (400 via Zod)', async () => {
    const res = await request(buildApp()).post('/auth/reset-password').send({ newPassword: 'short' });
    assert.equal(res.status, 400);
  });

  it('rejects refresh with no refreshToken in the body (400)', async () => {
    const res = await request(buildApp()).post('/auth/refresh').send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'refreshToken is required');
  });

  it('rejects refresh with a malformed refreshToken (401, before any Prisma call)', async () => {
    const res = await request(buildApp()).post('/auth/refresh').send({ refreshToken: 'not-a-real-jwt' });
    assert.equal(res.status, 401);
  });

  it('logout succeeds with no auth required (stateless JWT, no DB touch)', async () => {
    const res = await request(buildApp()).post('/auth/logout').send({});
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it('rejects GET /me with no Authorization header (401)', async () => {
    const res = await request(buildApp()).get('/auth/me');
    assert.equal(res.status, 401);
  });

  it('rejects change-password with no Authorization header (401, before Zod body parsing)', async () => {
    const res = await request(buildApp()).post('/auth/change-password').send({});
    assert.equal(res.status, 401);
  });
});
