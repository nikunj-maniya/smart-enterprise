import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NotificationPreferenceRow, ProfileDto, SmartSearchMemoryDto } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import Profile from './Profile';

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

const profile: ProfileDto = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: null,
  jobTitle: 'Engineer',
  location: null,
  roles: ['employee'],
  departments: ['Engineering'],
};

const prefRow: NotificationPreferenceRow = {
  type: 'request_needs_approval',
  label: 'New request needs your approval',
  mandatory: false,
  inApp: true,
  slack: false,
};

const mandatoryRow: NotificationPreferenceRow = {
  type: 'request_approved',
  label: 'Your request was approved',
  mandatory: true,
  inApp: true,
  slack: true,
};

const memory: SmartSearchMemoryDto = {
  id: 'mem-1',
  content: 'Prefers to be reminded about leave requests a week in advance.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function stubBase(
  p: ProfileDto = profile,
  rows: NotificationPreferenceRow[] = [prefRow, mandatoryRow],
  memories: SmartSearchMemoryDto[] = [],
) {
  stubs.push(
    { method: 'GET', path: '/profile', status: 200, body: p },
    { method: 'GET', path: '/profile/notification-preferences', status: 200, body: { rows } },
    { method: 'GET', path: '/smart-search/memories', status: 200, body: { rows: memories } },
  );
}

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('loads and displays the profile with prefilled editable fields', async () => {
  stubBase();
  renderPage();
  assert.ok(await screen.findByText('Ada Lovelace'));
  assert.equal((screen.getByLabelText('Full name') as HTMLInputElement).value, 'Ada Lovelace');
  assert.equal((screen.getByLabelText('Job title') as HTMLInputElement).value, 'Engineer');
  assert.ok(screen.getByText('ada@example.com'));
});

test('requires a non-empty name before saving', async () => {
  stubBase();
  renderPage();
  await screen.findByText('Ada Lovelace');

  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));

  assert.ok(await screen.findByText('Name is required.'));
  assert.equal(requests.some((r) => r.method === 'PUT' && r.path === '/profile'), false);
});

test('saves profile info, refreshes the auth user, and shows the saved confirmation', async () => {
  stubBase();
  stubs.push(
    { method: 'PUT', path: '/profile', status: 200, body: { ...profile, name: 'Ada L.', phone: '+91 98765 43210' } },
    { method: 'GET', path: '/auth/me', status: 200, body: {} },
  );
  renderPage();
  await screen.findByText('Ada Lovelace');

  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ada L.' } });
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+91 98765 43210' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));

  assert.ok(await screen.findByText('Profile saved.'));
  const put = requests.find((r) => r.method === 'PUT' && r.path === '/profile');
  assert.ok(put);
  assert.deepEqual(put.body, { name: 'Ada L.', phone: '+91 98765 43210', jobTitle: 'Engineer', location: null });
  assert.ok(requests.some((r) => r.method === 'GET' && r.path === '/auth/me'));
});

test('surfaces an error when saving the profile fails', async () => {
  stubBase();
  stubs.push({ method: 'PUT', path: '/profile', status: 500, body: { error: 'Unable to save your profile.' } });
  renderPage();
  await screen.findByText('Ada Lovelace');

  fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
  assert.ok(await screen.findByText('Unable to save your profile.'));
});

test('renders roles and departments as read-only chips', async () => {
  stubBase();
  renderPage();
  await screen.findByText('Ada Lovelace');
  assert.ok(screen.getByText('employee'));
  assert.ok(screen.getByText('Engineering'));
});

test('toggles a non-mandatory notification preference and disables mandatory ones', async () => {
  stubBase();
  stubs.push({
    method: 'PUT',
    path: '/profile/notification-preferences',
    status: 200,
    body: { rows: [{ ...prefRow, inApp: false }, mandatoryRow] },
  });
  renderPage();
  await screen.findByText('New request needs your approval');

  const switches = screen.getAllByRole('switch');
  // Row order: [pref.inApp, pref.slack, mandatory.inApp, mandatory.slack]
  assert.equal(switches[2].hasAttribute('disabled'), true);
  assert.equal(switches[3].hasAttribute('disabled'), true);

  fireEvent.click(switches[0]);

  await waitFor(() => {
    const put = requests.find((r) => r.method === 'PUT' && r.path === '/profile/notification-preferences');
    assert.ok(put);
  });
  const put = requests.find((r) => r.method === 'PUT' && r.path === '/profile/notification-preferences');
  assert.deepEqual(put!.body, { type: 'request_needs_approval', channel: 'inApp', enabled: false });
  await waitFor(() => assert.equal(switches[0].getAttribute('aria-checked'), 'false'));
});

test('surfaces an error when toggling a notification preference fails', async () => {
  stubBase();
  stubs.push({
    method: 'PUT',
    path: '/profile/notification-preferences',
    status: 500,
    body: { error: 'Unable to update this preference.' },
  });
  renderPage();
  await screen.findByText('New request needs your approval');

  fireEvent.click(screen.getAllByRole('switch')[0]);
  assert.ok(await screen.findByText('Unable to update this preference.'));
});

test('rejects a new password shorter than 8 characters in the change-password card', async () => {
  stubBase();
  renderPage();
  await screen.findByText('Ada Lovelace');

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'short' } });
  fireEvent.click(screen.getByRole('button', { name: /Update password/ }));

  assert.ok(await screen.findByText('New password must be at least 8 characters.'));
  assert.equal(requests.some((r) => r.path === '/auth/change-password'), false);
});

test('changes the password and clears the fields on success', async () => {
  stubBase();
  stubs.push({ method: 'POST', path: '/auth/change-password', status: 200, body: profile });
  renderPage();
  await screen.findByText('Ada Lovelace');

  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'oldpass1' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpassword1' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'newpassword1' } });
  fireEvent.click(screen.getByRole('button', { name: /Update password/ }));

  assert.ok(await screen.findByText('Password updated.'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/auth/change-password');
  assert.ok(post);
  assert.deepEqual(post.body, { currentPassword: 'oldpass1', newPassword: 'newpassword1' });
  assert.equal((screen.getByLabelText('Current password') as HTMLInputElement).value, '');
});

test('surfaces an error when the notification preferences fail to load', async () => {
  stubs.push(
    { method: 'GET', path: '/profile', status: 200, body: profile },
    {
      method: 'GET',
      path: '/profile/notification-preferences',
      status: 500,
      body: { error: 'Unable to load notification preferences.' },
    },
    { method: 'GET', path: '/smart-search/memories', status: 200, body: { rows: [] } },
  );
  renderPage();
  assert.ok(await screen.findByText('Unable to load notification preferences.'));
});

test('shows an empty state when no facts have been remembered', async () => {
  stubBase();
  renderPage();
  assert.ok(await screen.findByText('No remembered facts yet.'));
});

test('lists remembered facts and edits one in place', async () => {
  stubBase(profile, [prefRow, mandatoryRow], [memory]);
  const updated = { ...memory, content: 'Prefers weekly leave reminders.' };
  stubs.push({ method: 'PATCH', path: '/smart-search/memories/mem-1', status: 200, body: updated });
  renderPage();
  await screen.findByText(memory.content);

  fireEvent.click(screen.getByRole('button', { name: 'Edit this remembered fact' }));
  const input = screen.getByLabelText('Edit remembered fact') as HTMLInputElement;
  fireEvent.change(input, { target: { value: updated.content } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  assert.ok(await screen.findByText(updated.content));
  const patch = requests.find((r) => r.method === 'PATCH' && r.path === '/smart-search/memories/mem-1');
  assert.deepEqual(patch!.body, { content: updated.content });
});

test('deletes a remembered fact after confirming', async () => {
  stubBase(profile, [prefRow, mandatoryRow], [memory]);
  stubs.push({ method: 'DELETE', path: '/smart-search/memories/mem-1', status: 204 });
  renderPage();
  await screen.findByText(memory.content);

  fireEvent.click(screen.getByRole('button', { name: 'Forget this fact' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Forget fact' }));

  await waitFor(() => {
    assert.ok(requests.some((r) => r.method === 'DELETE' && r.path === '/smart-search/memories/mem-1'));
  });
  assert.ok(await screen.findByText('No remembered facts yet.'));
});

test('surfaces an error when remembered facts fail to load', async () => {
  stubs.push(
    { method: 'GET', path: '/profile', status: 200, body: profile },
    { method: 'GET', path: '/profile/notification-preferences', status: 200, body: { rows: [] } },
    {
      method: 'GET',
      path: '/smart-search/memories',
      status: 500,
      body: { error: 'Unable to load remembered facts.' },
    },
  );
  renderPage();
  assert.ok(await screen.findByText('Unable to load remembered facts.'));
});
