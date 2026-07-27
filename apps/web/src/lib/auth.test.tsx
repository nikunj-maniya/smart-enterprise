import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { AuthUser } from '@se/shared';
import { AuthProvider, useAuth } from './auth';

interface Stub {
  method: string;
  path: string;
  status: number;
  body?: unknown;
}

let stubs: Stub[] = [];
let requests: { method: string; path: string }[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  stubs = [];
  requests = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path });
    const stub = stubs.find((s) => s.method === method && s.path === path);
    if (!stub) {
      return new Response(JSON.stringify({ error: `No stub for ${method} ${path}` }), { status: 500 });
    }
    return new Response(stub.status === 204 ? null : JSON.stringify(stub.body), { status: stub.status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(AuthProvider, null, children);
}

/** Flushes the microtask/macrotask queue so a chained `.then().catch().finally()` settles. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const adaUser: AuthUser = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  isSystemAdmin: false,
  mustChangePassword: false,
  tenantId: 't-1',
  tenantName: 'Acme',
  roles: ['employee'],
};

test('always calls GET /auth/me on mount (tokens are httpOnly cookies, not JS-readable) and settles to user=null on a 401', async () => {
  stubs.push({ method: 'GET', path: '/auth/me', status: 401, body: { error: 'Unauthorized' } });
  const { result } = renderHook(() => useAuth(), { wrapper });
  await flush();
  assert.equal(result.current.loading, false);
  assert.equal(result.current.user, null);
  assert.ok(requests.find((r) => r.method === 'GET' && r.path === '/auth/me'));
});

test('auto-loads the user from an existing session via GET /auth/me', async () => {
  stubs.push({ method: 'GET', path: '/auth/me', status: 200, body: adaUser });
  const { result } = renderHook(() => useAuth(), { wrapper });
  await flush();
  assert.equal(result.current.loading, false);
  assert.deepEqual(result.current.user, adaUser);
});

test('login sets the authenticated user from the response body (the server sets auth cookies out of band)', async () => {
  stubs.push({ method: 'GET', path: '/auth/me', status: 401 });
  stubs.push({
    method: 'POST',
    path: '/auth/login',
    status: 200,
    body: { user: adaUser },
  });
  const { result } = renderHook(() => useAuth(), { wrapper });
  await flush();

  let returned: AuthUser | undefined;
  await act(async () => {
    returned = await result.current.login('ada@example.com', 'secret123');
  });

  assert.deepEqual(returned, adaUser);
  assert.deepEqual(result.current.user, adaUser);
  const loginCall = requests.find((r) => r.path === '/auth/login');
  assert.ok(loginCall);
  assert.equal(loginCall.method, 'POST');
});

test('changePassword updates the authenticated user with the response', async () => {
  stubs.push(
    { method: 'GET', path: '/auth/me', status: 200, body: adaUser },
    {
      method: 'POST',
      path: '/auth/change-password',
      status: 200,
      body: { ...adaUser, mustChangePassword: false },
    },
  );
  const { result } = renderHook(() => useAuth(), { wrapper });
  await flush();

  let returned: AuthUser | undefined;
  await act(async () => {
    returned = await result.current.changePassword('oldpass', 'newpass123');
  });
  assert.deepEqual(returned, { ...adaUser, mustChangePassword: false });
  assert.deepEqual(result.current.user, { ...adaUser, mustChangePassword: false });
});

test('refresh() re-fetches /auth/me and replaces the authenticated user', async () => {
  stubs.push({ method: 'GET', path: '/auth/me', status: 200, body: adaUser });
  const { result } = renderHook(() => useAuth(), { wrapper });
  await flush();
  assert.deepEqual(result.current.user, adaUser);

  const stub = stubs.find((s) => s.method === 'GET' && s.path === '/auth/me');
  assert.ok(stub);
  const renamed = { ...adaUser, name: 'Ada L.' };
  stub.body = renamed;
  await act(async () => {
    await result.current.refresh();
  });
  assert.deepEqual(result.current.user, renamed);
});

test('logout calls POST /auth/logout (revoking the session server-side) and clears the authenticated user', async () => {
  stubs.push(
    { method: 'GET', path: '/auth/me', status: 200, body: adaUser },
    { method: 'POST', path: '/auth/logout', status: 200, body: { ok: true } },
  );
  const { result } = renderHook(() => useAuth(), { wrapper });
  await flush();
  assert.deepEqual(result.current.user, adaUser);

  act(() => result.current.logout());
  assert.equal(result.current.user, null);
  await flush();
  assert.ok(requests.find((r) => r.method === 'POST' && r.path === '/auth/logout'));
});

test('useAuth throws when called outside an AuthProvider', () => {
  assert.throws(() => renderHook(() => useAuth()), /useAuth must be used within AuthProvider/);
});
