import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AuthUser } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import ChangePassword from './ChangePassword';

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

function signIn(user: AuthUser) {
  localStorage.setItem('se.accessToken', 'at-1');
  localStorage.setItem('se.refreshToken', 'rt-1');
  stubs.push({ method: 'GET', path: '/auth/me', status: 200, body: user });
}

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/change-password']}>
        <Routes>
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/" element={<div>Home screen</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('shows the forced-change banner only when the signed-in user must change their password', async () => {
  signIn({ ...baseUser, mustChangePassword: true });
  renderPage();
  assert.ok(
    await screen.findByText('For your security, you must change the default password before continuing.'),
  );
});

test('hides the forced-change banner for a user who does not need to change their password', async () => {
  signIn(baseUser);
  renderPage();
  await screen.findByLabelText('Current password');
  assert.equal(
    screen.queryByText('For your security, you must change the default password before continuing.'),
    null,
  );
});

test('rejects a new password shorter than 8 characters', async () => {
  signIn(baseUser);
  renderPage();
  await screen.findByLabelText('Current password');

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'short' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  assert.ok(await screen.findByText('New password must be at least 8 characters.'));
  assert.equal(requests.some((r) => r.path === '/auth/change-password'), false);
});

test('rejects a mismatched confirmation', async () => {
  signIn(baseUser);
  renderPage();
  await screen.findByLabelText('Current password');

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpassword1' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'newpassword2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  assert.ok(await screen.findByText('New password and confirmation do not match.'));
});

test('changes the password and navigates home on success', async () => {
  signIn(baseUser);
  stubs.push({ method: 'POST', path: '/auth/change-password', status: 200, body: { ...baseUser, mustChangePassword: false } });
  renderPage();
  await screen.findByLabelText('Current password');

  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'oldpass1' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpassword1' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'newpassword1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  assert.ok(await screen.findByText('Home screen'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/auth/change-password');
  assert.ok(post);
  assert.deepEqual(post.body, { currentPassword: 'oldpass1', newPassword: 'newpassword1' });
});

test('surfaces an incorrect-current-password error from the API', async () => {
  signIn(baseUser);
  stubs.push({
    method: 'POST',
    path: '/auth/change-password',
    status: 400,
    body: { error: 'Current password is incorrect.' },
  });
  renderPage();
  await screen.findByLabelText('Current password');

  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrongpass' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpassword1' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'newpassword1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  assert.ok(await screen.findByText('Current password is incorrect.'));
});
