import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { authRateLimiter } from './rate-limit.js';

function buildApp() {
  const app = express();
  app.use('/auth', authRateLimiter);
  app.get('/auth/login', (_req, res) => res.json({ ok: true }));
  return app;
}

test('authRateLimiter allows requests up to the limit', async () => {
  const app = buildApp();
  for (let i = 0; i < 20; i++) {
    const res = await request(app).get('/auth/login');
    assert.equal(res.status, 200);
  }
});

test('authRateLimiter blocks requests once the limit is exceeded', async () => {
  const app = buildApp();
  for (let i = 0; i < 20; i++) {
    await request(app).get('/auth/login');
  }
  const res = await request(app).get('/auth/login');
  assert.equal(res.status, 429);
});
