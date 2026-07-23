import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AuthUser } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import { ProtectedRoute } from './ProtectedRoute';

interface Stub {
  method: string;
  path: string;
  status: number;
  body?: unknown;
}

let stubs: Stub[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  stubs = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    const stub = stubs.find((s) => s.method === method && s.path === path);
    if (!stub) {
      return new Response(JSON.stringify({ error: `No stub for ${method} ${path}` }), { status: 500 });
    }
    return new Response(stub.status === 204 ? null : JSON.stringify(stub.body), { status: stub.status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  localStorage.clear();
  cleanup();
});

const baseUser: AuthUser = {
  id: 'u-1',
  name: 'Alice Admin',
  email: 'alice@acme.com',
  isSystemAdmin: false,
  mustChangePassword: false,
  tenantId: 't-1',
  tenantName: 'Acme',
  roles: ['enterprise-admin'],
};

function stubMe(user: AuthUser) {
  localStorage.setItem('se.accessToken', 'test-token');
  localStorage.setItem('se.refreshToken', 'test-refresh');
  stubs.push({ method: 'GET', path: '/auth/me', status: 200, body: user });
}

function renderGuarded(initialPath: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<div>Login screen</div>} />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <div>Change password screen</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Secret content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('redirects to /login when there is no authenticated user', () => {
  renderGuarded('/protected');
  assert.ok(screen.getByText('Login screen'));
  assert.equal(screen.queryByText('Secret content'), null);
});

test('shows a loading state while the session is being resolved', () => {
  stubMe(baseUser);
  renderGuarded('/protected');
  assert.ok(screen.getByText('Loading…'));
});

test('renders children once the user loads and has no forced password change', async () => {
  stubMe(baseUser);
  renderGuarded('/protected');
  assert.ok(await screen.findByText('Secret content'));
});

test('forces /change-password when the user must change their password', async () => {
  stubMe({ ...baseUser, mustChangePassword: true });
  renderGuarded('/protected');
  assert.ok(await screen.findByText('Change password screen'));
  assert.equal(screen.queryByText('Secret content'), null);
});

test('does not redirect away from /change-password itself when a password change is required', async () => {
  stubMe({ ...baseUser, mustChangePassword: true });
  renderGuarded('/change-password');
  assert.ok(await screen.findByText('Change password screen'));
});
