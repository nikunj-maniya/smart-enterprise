import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AuthUser } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import SetNewPassword from './SetNewPassword';

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

function renderPage(initialPath = '/set-new-password?token=reset-tok-1') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/set-new-password" element={<SetNewPassword />} />
          <Route path="/" element={<div>Home screen</div>} />
          <Route path="/change-password" element={<div>Change password screen</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('shows an invalid-link message when the URL has no token', () => {
  renderPage('/set-new-password');
  assert.ok(screen.getByText('Invalid reset link'));
});

test('rejects a new password shorter than 8 characters', () => {
  renderPage();
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'short' } });
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));

  assert.ok(screen.getByText('New password must be at least 8 characters.'));
  assert.equal(requests.some((r) => r.path === '/auth/reset-password'), false);
});

test('rejects a mismatched confirmation', () => {
  renderPage();
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpassword1' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'newpassword2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));

  assert.ok(screen.getByText('New password and confirmation do not match.'));
});

test('resets the password and shows the confirmation screen with the token in the request', async () => {
  stubs.push({ method: 'POST', path: '/auth/reset-password', status: 200, body: {} });
  renderPage();

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpassword1' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'newpassword1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));

  assert.ok(await screen.findByText('Password updated'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/auth/reset-password');
  assert.ok(post);
  assert.deepEqual(post.body, { token: 'reset-tok-1', newPassword: 'newpassword1' });
});

test('surfaces an expired-token error from the API', async () => {
  stubs.push({
    method: 'POST',
    path: '/auth/reset-password',
    status: 400,
    body: { error: 'This reset link has expired.' },
  });
  renderPage();

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpassword1' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'newpassword1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));

  assert.ok(await screen.findByText('This reset link has expired.'));
  assert.equal(screen.queryByText('Password updated'), null);
});

test('an already-authenticated user is redirected away from the reset screen', async () => {
  stubs.push({ method: 'GET', path: '/auth/me', status: 200, body: baseUser });
  renderPage();

  assert.ok(await screen.findByText('Home screen'));
});
