import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AuthUser } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import ForgotPassword from './ForgotPassword';

interface Stub {
  method: string;
  path: string;
  status: number;
  body?: unknown;
}

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let stubs: Stub[] = [];
let requests: Recorded[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  stubs = [];
  requests = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
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
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  isSystemAdmin: false,
  mustChangePassword: false,
  tenantId: 't-1',
  tenantName: 'Acme',
  roles: ['employee'],
};

function renderPage(initialPath = '/forgot-password') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/" element={<div>Home screen</div>} />
          <Route path="/change-password" element={<div>Change password screen</div>} />
          <Route path="/login" element={<div>Login screen</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('submits the email and shows the check-your-email confirmation', async () => {
  stubs.push({ method: 'POST', path: '/auth/forgot-password', status: 200, body: {} });
  renderPage();

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

  assert.ok(await screen.findByText('Check your email'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/auth/forgot-password');
  assert.ok(post);
  assert.deepEqual(post.body, { email: 'ada@example.com' });
});

test('surfaces an API error instead of the confirmation screen', async () => {
  stubs.push({
    method: 'POST',
    path: '/auth/forgot-password',
    status: 429,
    body: { error: 'Too many requests. Try again later.' },
  });
  renderPage();

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

  assert.ok(await screen.findByText('Too many requests. Try again later.'));
  assert.equal(screen.queryByText('Check your email'), null);
});

test('an already-authenticated user is redirected to / (no forced password change)', async () => {
  stubs.push({ method: 'GET', path: '/auth/me', status: 200, body: baseUser });
  renderPage();

  assert.ok(await screen.findByText('Home screen'));
});

test('an already-authenticated user who must change their password is redirected to /change-password', async () => {
  stubs.push({ method: 'GET', path: '/auth/me', status: 200, body: { ...baseUser, mustChangePassword: true } });
  renderPage();

  assert.ok(await screen.findByText('Change password screen'));
});
