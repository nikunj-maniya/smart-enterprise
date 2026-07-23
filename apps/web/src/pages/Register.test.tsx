import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AuthUser } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import Register from './Register';

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

function renderPage(initialPath = '/register') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<div>Home screen</div>} />
          <Route path="/change-password" element={<div>Change password screen</div>} />
          <Route path="/login" element={<div>Login screen</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/Company name/), { target: { value: 'Acme Corporation' } });
  fireEvent.change(screen.getByLabelText(/Industry/), { target: { value: 'Technology' } });
  fireEvent.change(screen.getByLabelText(/Company size/), { target: { value: '20–50' } });
  fireEvent.change(screen.getByLabelText(/Admin full name/), { target: { value: 'Jane Doe' } });
  fireEvent.change(screen.getByLabelText(/Admin email/), { target: { value: 'jane@acme.com' } });
}

test('rejects a mismatched password confirmation without submitting', async () => {
  renderPage();
  fillRequiredFields();
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'password1' } });
  fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'password2' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit for review/ }));

  assert.ok(await screen.findByText('Passwords do not match.'));
  assert.equal(requests.some((r) => r.path === '/registrations'), false);
});

test('submits the registration and shows the pending-review confirmation', async () => {
  stubs.push({ method: 'POST', path: '/registrations', status: 201, body: {} });
  renderPage();
  fillRequiredFields();
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'password1' } });
  fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'password1' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit for review/ }));

  assert.ok(await screen.findByText('Registration submitted'));
  assert.ok(screen.getByText('Acme Corporation', { selector: 'strong' }));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/registrations');
  assert.ok(post);
  assert.deepEqual(post.body, {
    companyName: 'Acme Corporation',
    industry: 'Technology',
    size: '20–50',
    contactName: 'Jane Doe',
    contactEmail: 'jane@acme.com',
    password: 'password1',
  });
});

test('surfaces a duplicate-registration error from the API', async () => {
  stubs.push({
    method: 'POST',
    path: '/registrations',
    status: 409,
    body: { error: 'A registration for this company already exists.' },
  });
  renderPage();
  fillRequiredFields();
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'password1' } });
  fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'password1' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit for review/ }));

  assert.ok(await screen.findByText('A registration for this company already exists.'));
});

test('an already-authenticated user is redirected away from /register', async () => {
  localStorage.setItem('se.accessToken', 'at-1');
  localStorage.setItem('se.refreshToken', 'rt-1');
  stubs.push({ method: 'GET', path: '/auth/me', status: 200, body: baseUser });
  renderPage();

  assert.ok(await screen.findByText('Home screen'));
});
