import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import App from './App';

afterEach(() => {
  localStorage.clear();
  cleanup();
});

// App.tsx is almost entirely declarative route config (ProtectedRoute/RequireRole wiring
// already covered by their own dedicated suites), so this is a light smoke test: it confirms
// the public routes resolve, and that an unauthenticated visitor lands back on /login rather
// than a broken route. No token is stored, so every ProtectedRoute redirects synchronously.
function renderAt(initialPath: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('/login resolves to the Login screen', () => {
  renderAt('/login');
  assert.ok(screen.getByText('Welcome back'));
});

test('/register resolves to the Register screen', () => {
  renderAt('/register');
  assert.ok(screen.getByText('Register your enterprise'));
});

test('an unknown path falls through the wildcard, hits Home, and lands on /login when signed out', () => {
  renderAt('/this-route-does-not-exist');
  assert.ok(screen.getByText('Welcome back'));
});

test('a protected route redirects a signed-out visitor to /login instead of rendering', () => {
  renderAt('/organization/users');
  assert.ok(screen.getByText('Welcome back'));
});
