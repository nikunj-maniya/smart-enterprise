import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import OrgUsers from './Users';

/**
 * List rendering, filters, and the Add/Edit modals. Approve/reject/deactivate/reactivate/remove,
 * reset-password, and the invite-link modal are covered separately in Users.actions.test.tsx —
 * kept apart to bound how much any one file exercises (see FormBuilder's split for why).
 */

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let usersBody: { rows: unknown[]; total: number } = { rows: [], total: 0 };
let statsBody = { active: 0, inactive: 0, departments: 0, pending: 0 };
let rolesBody: unknown[] = [];
let departmentsBody: unknown[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  usersBody = { rows: [], total: 0 };
  statsBody = { active: 0, inactive: 0, departments: 0, pending: 0 };
  rolesBody = [];
  departmentsBody = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path.startsWith('/roles?')) return new Response(JSON.stringify({ rows: rolesBody, total: (rolesBody as unknown[]).length }), { status: 200 });
    if (method === 'GET' && path.startsWith('/departments?')) return new Response(JSON.stringify({ rows: departmentsBody, total: (departmentsBody as unknown[]).length }), { status: 200 });
    if (method === 'GET' && path === '/org-users/stats') return new Response(JSON.stringify(statsBody), { status: 200 });
    if (method === 'GET' && path.startsWith('/org-users?')) return new Response(JSON.stringify(usersBody), { status: 200 });
    if (method === 'POST' && path === '/org-users') return new Response(JSON.stringify({ id: 'u-new' }), { status: 201 });
    if (method === 'PUT' && /\/org-users\/[^/]+$/.test(path)) return new Response(JSON.stringify({ ok: true }), { status: 200 });
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

const activeUser = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@acme.com',
  status: 'Active',
  roles: [{ id: 'r1', name: 'HR Head' }],
  departments: [{ id: 'd1', name: 'Engineering' }],
  createdAt: '2026-01-01T00:00:00.000Z',
};
const pendingUser = { ...activeUser, id: 'u2', name: 'Grace Hopper', status: 'Pending', roles: [], departments: [] };
const inactiveUser = { ...activeUser, id: 'u3', name: 'Bob', status: 'Inactive' };

test('renders the stat cards from /org-users/stats', async () => {
  statsBody = { active: 12, inactive: 3, departments: 4, pending: 1 };
  renderPage();
  assert.ok(await screen.findByText('12'));
  assert.ok(screen.getByText('Active Users'));
  assert.ok(screen.getByText('3'));
  assert.ok(screen.getByText('4'));
});

test('renders a user row with department, role badge, and status', async () => {
  usersBody = { rows: [activeUser], total: 1 };
  renderPage();
  assert.ok(await screen.findByText('Ada Lovelace'));
  assert.ok(screen.getByText('ada@acme.com'));
  assert.ok(screen.getByText('Engineering'));
  assert.ok(screen.getByText('HR Head'));
  // "Active" also appears as a status-filter button — scope to the row's status badge (a <span>).
  assert.ok(screen.getAllByText('Active').find((el) => el.tagName === 'SPAN'));
});

test('shows the empty state when no users match', async () => {
  renderPage();
  assert.ok(await screen.findByText('No users match your search.'));
});

test('a Pending user shows Edit/Approve/Reject, not Deactivate/Remove', async () => {
  usersBody = { rows: [pendingUser], total: 1 };
  renderPage();
  await screen.findByText('Grace Hopper');
  assert.ok(screen.getByRole('button', { name: /Approve/ }));
  assert.ok(screen.getByRole('button', { name: 'Reject' }));
  assert.ok(screen.getByLabelText('Edit Grace Hopper'));
  assert.equal(screen.queryByText('Deactivate'), null);
});

test('an Active user shows Edit/Reset/Deactivate/Remove, not Approve/Reject', async () => {
  usersBody = { rows: [activeUser], total: 1 };
  renderPage();
  await screen.findByText('Ada Lovelace');
  assert.ok(screen.getByLabelText('Edit Ada Lovelace'));
  assert.ok(screen.getByLabelText('Reset password for Ada Lovelace'));
  assert.ok(screen.getByText('Deactivate'));
  assert.ok(screen.getByLabelText('Remove Ada Lovelace'));
  assert.equal(screen.queryByText('Approve'), null);
});

test('an Inactive user shows only Reactivate/Remove', async () => {
  usersBody = { rows: [inactiveUser], total: 1 };
  renderPage();
  await screen.findByText('Bob');
  assert.ok(screen.getByRole('button', { name: /Reactivate/ }));
  assert.ok(screen.getByLabelText('Remove Bob'));
  assert.equal(screen.queryByLabelText('Edit Bob'), null);
});

test('the Pending filter shows the badge count from stats, and clicking it refetches', async () => {
  statsBody = { active: 0, inactive: 0, departments: 0, pending: 5 };
  renderPage();
  await screen.findByText('No users match your search.');
  const pendingBtn = screen.getByRole('button', { name: /Pending/ });
  assert.ok(within(pendingBtn).getByText('5'));

  fireEvent.click(pendingBtn);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(requests.some((r) => r.method === 'GET' && r.path.startsWith('/org-users?') && r.path.includes('status=Pending')));
});

test('the department filter refetches with the selected departmentId', async () => {
  departmentsBody = [{ id: 'd1', name: 'Engineering' }];
  renderPage();
  await screen.findByText('No users match your search.');
  fireEvent.change(screen.getByDisplayValue('All Departments'), { target: { value: 'd1' } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(requests.some((r) => r.method === 'GET' && r.path.startsWith('/org-users?') && r.path.includes('departmentId=d1')));
});

test('Add User validates name, email, and an 8-char password, then creates', async () => {
  rolesBody = [{ id: 'r1', name: 'HR Head' }];
  departmentsBody = [{ id: 'd1', name: 'Engineering' }];
  renderPage();
  await screen.findByText('No users match your search.');

  fireEvent.click(screen.getByRole('button', { name: /Add User/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Send Invite/ }));
  assert.ok(await within(dialog).findByText('Name is required.'));

  fireEvent.change(within(dialog).getByPlaceholderText('Priya Raman'), { target: { value: 'Priya Raman' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Send Invite/ }));
  assert.ok(await within(dialog).findByText('Email is required.'));

  fireEvent.change(within(dialog).getByPlaceholderText('priya@company.com'), { target: { value: 'priya@acme.com' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Send Invite/ }));
  assert.ok(await within(dialog).findByText('Password must be at least 8 characters.'));

  fireEvent.change(within(dialog).getByPlaceholderText('At least 8 characters'), { target: { value: 'secret123' } });
  fireEvent.click(within(dialog).getByText('HR Head'));
  fireEvent.click(within(dialog).getByText('Engineering'));
  usersBody = { rows: [{ ...activeUser, id: 'u-new', name: 'Priya Raman' }], total: 1 };
  fireEvent.click(within(dialog).getByRole('button', { name: /Send Invite/ }));

  assert.ok(await screen.findByText('Priya Raman'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/org-users');
  assert.deepEqual(post?.body, {
    name: 'Priya Raman',
    email: 'priya@acme.com',
    password: 'secret123',
    roleIds: ['r1'],
    departmentIds: ['d1'],
  });
});

test('Edit User prefills name/roles/departments and saves via PUT', async () => {
  usersBody = { rows: [activeUser], total: 1 };
  rolesBody = [{ id: 'r1', name: 'HR Head' }];
  departmentsBody = [{ id: 'd1', name: 'Engineering' }];
  renderPage();
  await screen.findByText('Ada Lovelace');

  fireEvent.click(screen.getByLabelText('Edit Ada Lovelace'));
  const dialog = screen.getByRole('dialog');
  const nameInput = within(dialog).getByDisplayValue('Ada Lovelace') as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: 'Ada L.' } });
  usersBody = { rows: [{ ...activeUser, name: 'Ada L.' }], total: 1 };
  fireEvent.click(within(dialog).getByRole('button', { name: /Save changes/ }));

  assert.ok(await screen.findByText('Ada L.'));
  const put = requests.find((r) => r.method === 'PUT' && r.path === '/org-users/u1');
  assert.deepEqual(put?.body, { name: 'Ada L.', roleIds: ['r1'], departmentIds: ['d1'] });
});
