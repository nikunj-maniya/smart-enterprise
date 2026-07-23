import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import OrgUsers from './Users';

/** Approve/reject/deactivate/reactivate/remove, reset-password, and the invite-link modal — split
 * from Users.test.tsx (list/filters/add/edit) to bound how much any one file exercises. */

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let usersBody: { rows: unknown[]; total: number } = { rows: [], total: 0 };
let removeStatus = 200;
let linkBody: unknown = null;
let clipboardWrites: string[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  usersBody = { rows: [], total: 0 };
  removeStatus = 200;
  linkBody = null;
  clipboardWrites = [];
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (text: string) => void clipboardWrites.push(text) },
    configurable: true,
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path.startsWith('/roles?')) return new Response(JSON.stringify({ rows: [], total: 0 }), { status: 200 });
    if (method === 'GET' && path.startsWith('/departments?')) return new Response(JSON.stringify({ rows: [], total: 0 }), { status: 200 });
    if (method === 'GET' && path === '/org-users/stats') return new Response(JSON.stringify({ active: 0, inactive: 0, departments: 0, pending: 0 }), { status: 200 });
    if (method === 'GET' && path.startsWith('/org-users?')) return new Response(JSON.stringify(usersBody), { status: 200 });
    if (method === 'POST' && /\/org-users\/[^/]+\/approve$/.test(path)) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (method === 'POST' && /\/org-users\/[^/]+\/reject$/.test(path)) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (method === 'POST' && /\/org-users\/[^/]+\/deactivate$/.test(path)) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (method === 'POST' && /\/org-users\/[^/]+\/reactivate$/.test(path)) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (method === 'POST' && /\/org-users\/[^/]+\/reset-password$/.test(path)) return new Response(JSON.stringify({ temporaryPassword: 'Tmp-Pass-123' }), { status: 200 });
    if (method === 'DELETE' && /\/org-users\/[^/]+$/.test(path)) {
      if (removeStatus !== 200) return new Response(JSON.stringify({ error: 'Heads a department — reassign first.' }), { status: removeStatus });
      return new Response(null, { status: 204 });
    }
    if (method === 'GET' && path === '/self-registration') return new Response(JSON.stringify(linkBody), { status: 200 });
    if (method === 'POST' && path === '/self-registration') {
      const body = JSON.parse(String(init?.body));
      linkBody = { url: 'https://acme.smartenterprise.app/join/abc123', expiresAt: new Date(Date.now() + body.expiryMinutes * 60000).toISOString(), expired: false };
      return new Response(JSON.stringify(linkBody), { status: 200 });
    }
    if (method === 'DELETE' && path === '/self-registration') {
      linkBody = null;
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ error: `No stub for ${method} ${path}` }), { status: 500 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <OrgUsers />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const pendingUser = {
  id: 'u2',
  name: 'Grace Hopper',
  email: 'grace@acme.com',
  status: 'Pending',
  roles: [],
  departments: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};
const activeUser = { ...pendingUser, id: 'u1', name: 'Ada Lovelace', status: 'Active' };
const inactiveUser = { ...pendingUser, id: 'u3', name: 'Bob', status: 'Inactive' };

test('Approve posts /approve and reloads the list', async () => {
  usersBody = { rows: [pendingUser], total: 1 };
  renderPage();
  await screen.findByText('Grace Hopper');

  usersBody = { rows: [], total: 0 };
  fireEvent.click(screen.getByRole('button', { name: /Approve/ }));

  assert.ok(await screen.findByText('No users match your search.'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/org-users/u2/approve'));
});

test('Reject opens a confirm dialog; confirming posts /reject and reloads', async () => {
  usersBody = { rows: [pendingUser], total: 1 };
  renderPage();
  await screen.findByText('Grace Hopper');

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  const dialog = screen.getByRole('dialog');
  // "Reject request" appears as both the dialog title and the confirm button — assert the title
  // rendered, then scope the click to the button role specifically.
  assert.ok(within(dialog).getAllByText('Reject request').length === 2);

  usersBody = { rows: [], total: 0 };
  fireEvent.click(within(dialog).getByRole('button', { name: /Reject request/ }));

  assert.ok(await screen.findByText('No users match your search.'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/org-users/u2/reject'));
});

test('Deactivate opens a confirm dialog; confirming posts /deactivate and reloads', async () => {
  usersBody = { rows: [activeUser], total: 1 };
  renderPage();
  await screen.findByText('Ada Lovelace');

  fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
  const dialog = screen.getByRole('dialog');
  assert.ok(within(dialog).getByText('Deactivate user'));

  usersBody = { rows: [{ ...activeUser, status: 'Inactive' }], total: 1 };
  fireEvent.click(within(dialog).getByRole('button', { name: /Deactivate/ }));

  assert.ok(await screen.findByRole('button', { name: /Reactivate/ }));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/org-users/u1/deactivate'));
});

test('Reactivate posts /reactivate and reloads', async () => {
  usersBody = { rows: [inactiveUser], total: 1 };
  renderPage();
  await screen.findByText('Bob');

  usersBody = { rows: [{ ...inactiveUser, status: 'Active' }], total: 1 };
  fireEvent.click(screen.getByRole('button', { name: /Reactivate/ }));

  assert.ok(await screen.findByText('Deactivate'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/org-users/u3/reactivate'));
});

test('Remove blocked by a dependency surfaces the reason and keeps the dialog open', async () => {
  usersBody = { rows: [activeUser], total: 1 };
  removeStatus = 409;
  renderPage();
  await screen.findByText('Ada Lovelace');

  fireEvent.click(screen.getByLabelText('Remove Ada Lovelace'));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Remove user/ }));

  assert.ok(await within(dialog).findByText('Heads a department — reassign first.'));
  assert.ok(screen.getByRole('dialog'));
});

test('Remove succeeds and reloads the list', async () => {
  usersBody = { rows: [activeUser], total: 1 };
  renderPage();
  await screen.findByText('Ada Lovelace');

  usersBody = { rows: [], total: 0 };
  fireEvent.click(screen.getByLabelText('Remove Ada Lovelace'));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Remove user/ }));

  assert.ok(await screen.findByText('No users match your search.'));
  assert.ok(requests.some((r) => r.method === 'DELETE' && r.path === '/org-users/u1'));
});

test('Reset password shows the temporary password, and Copy copies it', async () => {
  usersBody = { rows: [activeUser], total: 1 };
  renderPage();
  await screen.findByText('Ada Lovelace');

  fireEvent.click(screen.getByLabelText('Reset password for Ada Lovelace'));
  assert.ok(await screen.findByText('Tmp-Pass-123'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/org-users/u1/reset-password'));

  fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
  assert.ok(await screen.findByText('Copied'));
  assert.deepEqual(clipboardWrites, ['Tmp-Pass-123']);
});

test('invite-link modal generates a link and shows it, then revoke clears it', async () => {
  renderPage();
  await screen.findByText('No users match your search.');

  fireEvent.click(screen.getByRole('button', { name: /Share invite link/ }));
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByText('Link expires after');

  fireEvent.click(within(dialog).getByRole('button', { name: /Generate link/ }));
  assert.ok(await within(dialog).findByText('https://acme.smartenterprise.app/join/abc123'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/self-registration');
  assert.deepEqual(post?.body, { expiryMinutes: 30 });

  fireEvent.click(within(dialog).getByRole('button', { name: /Revoke/ }));
  assert.ok(await within(dialog).findByText('Link expires after'));
  assert.ok(requests.some((r) => r.method === 'DELETE' && r.path === '/self-registration'));
});

test('an existing active link loads directly with a Copy button', async () => {
  linkBody = { url: 'https://acme.smartenterprise.app/join/existing', expiresAt: '2026-12-31T00:00:00.000Z', expired: false };
  renderPage();
  await screen.findByText('No users match your search.');

  fireEvent.click(screen.getByRole('button', { name: /Share invite link/ }));
  const dialog = screen.getByRole('dialog');
  assert.ok(await within(dialog).findByText('https://acme.smartenterprise.app/join/existing'));
  assert.ok(within(dialog).getByRole('button', { name: /Copy/ }));
});
