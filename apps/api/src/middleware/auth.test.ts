import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { requireAuth } from './auth.js';
import { errorHandler } from './error.js';

/**
 * Integration test against the real `requireAuth` middleware, mounted on a minimal
 * throwaway app (not the full apps/api/src/index.ts, which binds a real port and
 * schedules background jobs as import side effects). Only exercises paths that
 * reject before touching the database — verifyAccessToken throws synchronously on
 * a missing/invalid token — so this suite stays deterministic with no live DB
 * (matches CI, which has no Postgres available).
 */
function buildApp() {
  const app = express();
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ ok: true, userId: req.user?.id });
  });
  app.use(errorHandler);
  return app;
}

test('requireAuth rejects a request with no Authorization header', async () => {
  const res = await request(buildApp()).get('/protected');
  assert.equal(res.status, 401);
});

test('requireAuth rejects a non-Bearer Authorization header', async () => {
  const res = await request(buildApp()).get('/protected').set('Authorization', 'Basic dXNlcjpwYXNz');
  assert.equal(res.status, 401);
});

test('requireAuth rejects a malformed/invalid-signature bearer token', async () => {
  const res = await request(buildApp()).get('/protected').set('Authorization', 'Bearer not-a-real-jwt');
  assert.equal(res.status, 401);
});
