import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { requireCsrfToken } from './csrf.js';
import { errorHandler } from './error.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(requireCsrfToken);
  app.get('/whatever', (_req, res) => res.json({ ok: true }));
  app.post('/whatever', (_req, res) => res.json({ ok: true }));
  app.post('/auth/login', (_req, res) => res.json({ ok: true }));
  app.post('/auth/refresh', (_req, res) => res.json({ ok: true }));
  app.post('/auth/logout', (_req, res) => res.json({ ok: true }));
  app.post('/auth/forgot-password', (_req, res) => res.json({ ok: true }));
  app.post('/auth/reset-password', (_req, res) => res.json({ ok: true }));
  app.post('/public/self-registration/tok', (_req, res) => res.json({ ok: true }));
  app.post('/slack/interactions', (_req, res) => res.json({ ok: true }));
  app.post('/registrations', (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

test('allows safe methods with no CSRF cookie/header at all', async () => {
  const res = await request(buildApp()).get('/whatever');
  assert.equal(res.status, 200);
});

test('rejects a mutating request with neither the CSRF cookie nor header', async () => {
  const res = await request(buildApp()).post('/whatever');
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Invalid or missing CSRF token');
});

test('rejects a mutating request with the cookie but no header', async () => {
  const res = await request(buildApp()).post('/whatever').set('Cookie', 'se_csrf=abc123');
  assert.equal(res.status, 403);
});

test('rejects a mutating request whose header does not match the cookie', async () => {
  const res = await request(buildApp())
    .post('/whatever')
    .set('Cookie', 'se_csrf=abc123')
    .set('X-CSRF-Token', 'different-value');
  assert.equal(res.status, 403);
});

test('allows a mutating request whose header matches the cookie', async () => {
  const res = await request(buildApp())
    .post('/whatever')
    .set('Cookie', 'se_csrf=abc123')
    .set('X-CSRF-Token', 'abc123');
  assert.equal(res.status, 200);
});

test('allows a Bearer-header request with no CSRF cookie/header at all (not cookie-riding)', async () => {
  const res = await request(buildApp()).post('/whatever').set('Authorization', 'Bearer some-token');
  assert.equal(res.status, 200);
});

for (const path of ['/auth/login', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password', '/registrations']) {
  test(`exempts ${path} from the CSRF check`, async () => {
    const res = await request(buildApp()).post(path);
    assert.equal(res.status, 200);
  });
}

test('does NOT exempt /auth/logout — it is an authenticated call the frontend sends the CSRF header on', async () => {
  const res = await request(buildApp()).post('/auth/logout');
  assert.equal(res.status, 403);
});

test('exempts /public/* paths from the CSRF check', async () => {
  const res = await request(buildApp()).post('/public/self-registration/tok');
  assert.equal(res.status, 200);
});

test('exempts /slack/interactions from the CSRF check', async () => {
  const res = await request(buildApp()).post('/slack/interactions');
  assert.equal(res.status, 200);
});
