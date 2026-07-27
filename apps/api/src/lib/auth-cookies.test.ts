import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {
  setAuthCookies,
  clearAuthCookies,
  getAccessTokenCookie,
  getRefreshTokenCookie,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
} from './auth-cookies.js';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/set', (_req, res) => {
    setAuthCookies(res, 'access-token-value', 'refresh-token-value');
    res.json({ ok: true });
  });
  app.get('/clear', (_req, res) => {
    clearAuthCookies(res);
    res.json({ ok: true });
  });
  app.get('/read', (req, res) => {
    res.json({ access: getAccessTokenCookie(req) ?? null, refresh: getRefreshTokenCookie(req) ?? null });
  });
  return app;
}

test('setAuthCookies sets httpOnly access/refresh cookies and a non-httpOnly CSRF cookie', async () => {
  const res = await request(buildApp()).get('/set');
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  assert.equal(setCookie.length, 3);

  const access = setCookie.find((c) => c.startsWith(`${ACCESS_COOKIE}=`))!;
  assert.match(access, /HttpOnly/);
  assert.match(access, /access-token-value/);

  const refresh = setCookie.find((c) => c.startsWith(`${REFRESH_COOKIE}=`))!;
  assert.match(refresh, /HttpOnly/);
  assert.match(refresh, /refresh-token-value/);

  const csrf = setCookie.find((c) => c.startsWith(`${CSRF_COOKIE}=`))!;
  assert.doesNotMatch(csrf, /HttpOnly/);
});

test('clearAuthCookies expires all three cookies', async () => {
  const res = await request(buildApp()).get('/clear');
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  assert.equal(setCookie.length, 3);
  for (const cookie of setCookie) {
    assert.match(cookie, /Expires=Thu, 01 Jan 1970/);
  }
});

test('getAccessTokenCookie/getRefreshTokenCookie read back what was set', async () => {
  const agent = request.agent(buildApp());
  await agent.get('/set');
  const res = await agent.get('/read');
  assert.deepEqual(res.body, { access: 'access-token-value', refresh: 'refresh-token-value' });
});

test('getAccessTokenCookie/getRefreshTokenCookie return undefined when no cookies are present', async () => {
  const res = await request(buildApp()).get('/read');
  assert.deepEqual(res.body, { access: null, refresh: null });
});
