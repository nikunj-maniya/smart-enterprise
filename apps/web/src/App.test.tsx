import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import App from './App';

const realFetch = globalThis.fetch;

beforeEach(() => {
  // Auth travels via an httpOnly cookie (finding #6) — AuthProvider always calls GET /auth/me on
  // mount to find out whether one exists. A 401 here is "signed out".
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

// App.tsx is almost entirely declarative route config (ProtectedRoute/RequireRole wiring
// already covered by their own dedicated suites), so this is a light smoke test: it confirms
// the public routes resolve, and that an unauthenticated visitor lands back on /login rather
// than a broken route.
function renderAt(initialPath: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('/login resolves to the Login screen', async () => {
  renderAt('/login');
  assert.ok(await screen.findByText('Welcome back'));
});

test('/register resolves to the Register screen', async () => {
  renderAt('/register');
  assert.ok(await screen.findByText('Register your enterprise'));
});

test('an unknown path falls through the wildcard, hits Home, and lands on /login when signed out', async () => {
  renderAt('/this-route-does-not-exist');
  assert.ok(await screen.findByText('Welcome back'));
});

test('a protected route redirects a signed-out visitor to /login instead of rendering', async () => {
  renderAt('/organization/users');
  assert.ok(await screen.findByText('Welcome back'));
});
