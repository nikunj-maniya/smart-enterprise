import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AuthUser } from '@se/shared';
import { SystemRoleKey } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import { ProtectedRoute } from './ProtectedRoute';
import { RequireRole } from './RequireRole';

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
  name: 'Fran Finance',
  email: 'fran@acme.com',
  isSystemAdmin: false,
  mustChangePassword: false,
  tenantId: 't-1',
  tenantName: 'Acme',
  roles: [SystemRoleKey.Finance],
};

function stubMe(user: AuthUser) {
  localStorage.setItem('se.accessToken', 'test-token');
  localStorage.setItem('se.refreshToken', 'test-refresh');
  stubs.push({ method: 'GET', path: '/auth/me', status: 200, body: user });
}

// RequireRole assumes ProtectedRoute already ran (per its own doc comment) — it has no
// `loading` guard of its own, so it must be nested under ProtectedRoute here too, otherwise
// it evaluates (and redirects on) a still-null `user` before the async /auth/me resolves.
function renderGuarded(role: string | string[]) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/gated']}>
        <Routes>
          <Route path="/login" element={<div>Login screen</div>} />
          <Route path="/" element={<div>Home screen</div>} />
          <Route
            path="/gated"
            element={
              <ProtectedRoute>
                <RequireRole role={role}>
                  <div>Gated content</div>
                </RequireRole>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('renders children when the user holds the single required role', async () => {
  stubMe(baseUser);
  renderGuarded(SystemRoleKey.Finance);
  assert.ok(await screen.findByText('Gated content'));
});

test('redirects to / when the user lacks the required role', async () => {
  stubMe(baseUser);
  renderGuarded(SystemRoleKey.EnterpriseAdmin);
  assert.ok(await screen.findByText('Home screen'));
  assert.equal(screen.queryByText('Gated content'), null);
});

test('renders children when the user holds at least one role from a list', async () => {
  stubMe(baseUser);
  renderGuarded([SystemRoleKey.EnterpriseAdmin, SystemRoleKey.Finance]);
  assert.ok(await screen.findByText('Gated content'));
});

test('redirects to / when the user holds none of the roles in a list', async () => {
  stubMe(baseUser);
  renderGuarded([SystemRoleKey.EnterpriseAdmin, SystemRoleKey.HrHead]);
  assert.ok(await screen.findByText('Home screen'));
  assert.equal(screen.queryByText('Gated content'), null);
});

test('redirects to /login (via ProtectedRoute) when there is no authenticated user at all', () => {
  renderGuarded(SystemRoleKey.Finance);
  assert.ok(screen.getByText('Login screen'));
});
