import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AuthUser } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import Login from './Login';

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

function renderLogin(initialPath = '/login') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div>Home screen</div>} />
          <Route path="/change-password" element={<div>Change password screen</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('pre-fills the email field with the default system admin address', () => {
  renderLogin();
  const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
  assert.equal(emailInput.value, 'systemadmin@smartenterprise.com');
});

test('logs in and redirects to / when no password change is required', async () => {
  stubs.push({
    method: 'POST',
    path: '/auth/login',
    status: 200,
    body: { accessToken: 'at-1', refreshToken: 'rt-1', user: baseUser },
  });
  renderLogin();

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

  assert.ok(await screen.findByText('Home screen'));
  const login = requests.find((r) => r.method === 'POST' && r.path === '/auth/login');
  assert.ok(login);
  assert.deepEqual(login.body, { email: 'ada@example.com', password: 'secret123' });
});

test('logs in and redirects to /change-password when the user must change their password', async () => {
  stubs.push({
    method: 'POST',
    path: '/auth/login',
    status: 200,
    body: { accessToken: 'at-1', refreshToken: 'rt-1', user: { ...baseUser, mustChangePassword: true } },
  });
  renderLogin();

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

  assert.ok(await screen.findByText('Change password screen'));
});

test('surfaces a 401 error from the API next to the form', async () => {
  stubs.push({
    method: 'POST',
    path: '/auth/login',
    status: 401,
    body: { error: 'Invalid email or password.' },
  });
  renderLogin();

  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

  assert.ok(await screen.findByText('Invalid email or password.'));
});

test('an already-authenticated user is redirected away from /login', async () => {
  localStorage.setItem('se.accessToken', 'at-1');
  localStorage.setItem('se.refreshToken', 'rt-1');
  stubs.push({ method: 'GET', path: '/auth/me', status: 200, body: baseUser });
  renderLogin();

  assert.ok(await screen.findByText('Home screen'));
});
