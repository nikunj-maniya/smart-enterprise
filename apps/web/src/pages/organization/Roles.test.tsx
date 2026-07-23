import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import Roles from './Roles';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let listBody: { rows: unknown[]; total: number } = { rows: [], total: 0 };
let deleteStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  listBody = { rows: [], total: 0 };
  deleteStatus = 200;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path.startsWith('/roles?')) return new Response(JSON.stringify(listBody), { status: 200 });
    if (method === 'POST' && path === '/roles') {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'role-new', ...body, isSystem: false, memberCount: 0, archived: false }), { status: 201 });
    }
    if (method === 'PUT' && path.startsWith('/roles/')) {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: path.split('/')[2], ...body }), { status: 200 });
    }
    if (method === 'POST' && /\/roles\/.+\/(archive|unarchive)$/.test(path)) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (method === 'DELETE' && path.startsWith('/roles/')) {
      if (deleteStatus !== 200) return new Response(JSON.stringify({ error: 'Still assigned to 3 members.' }), { status: deleteStatus });
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
      <Roles />
    </AuthProvider>,
  );
}

const hrHead = { id: 'r1', name: 'HR Head', permissions: ['view_all_forms', 'submit_request'], memberCount: 3, isSystem: true, archived: false };
const financeApprover = { id: 'r2', name: 'Finance Approver', permissions: ['view_all_forms'], memberCount: 1, isSystem: false, archived: false };

test('renders a role row with its scope summary, member count, and type badge', async () => {
  listBody = { rows: [hrHead], total: 1 };
  renderPage();
  assert.ok(await screen.findByText('HR Head'));
  assert.ok(screen.getByText('View all form types · Submit a request'));
  assert.ok(screen.getByText('3'));
  // "System" also appears as a filter-pill button — scope to the row's type badge (a <span>).
  assert.ok(screen.getAllByText('System').find((el) => el.tagName === 'SPAN'));
});

test('a system role has no Archive/Delete actions, only Edit', async () => {
  listBody = { rows: [hrHead], total: 1 };
  renderPage();
  await screen.findByText('HR Head');
  assert.ok(screen.getByRole('button', { name: /Edit/ }));
  assert.equal(screen.queryByLabelText(/Archive HR Head/), null);
  assert.equal(screen.queryByLabelText('Delete HR Head'), null);
});

test('a custom role has Edit, Archive, and Delete actions', async () => {
  listBody = { rows: [financeApprover], total: 1 };
  renderPage();
  await screen.findByText('Finance Approver');
  assert.ok(screen.getByRole('button', { name: /Edit/ }));
  assert.ok(screen.getByLabelText('Archive Finance Approver'));
  assert.ok(screen.getByLabelText('Delete Finance Approver'));
});

test('shows the empty state when no roles match', async () => {
  renderPage();
  assert.ok(await screen.findByText('No roles match your search.'));
});

test('New Role requires a name, toggles a permission, and creates the role', async () => {
  renderPage();
  await screen.findByText('No roles match your search.');

  fireEvent.click(screen.getByRole('button', { name: /New Role/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  assert.ok(await within(dialog).findByText('Role name is required.'));

  fireEvent.change(within(dialog).getByPlaceholderText('e.g. Finance Approver'), { target: { value: 'Auditor' } });
  fireEvent.click(within(dialog).getByText('Submit a request'));
  listBody = { rows: [{ ...financeApprover, id: 'role-new', name: 'Auditor' }], total: 1 };
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  assert.ok(await screen.findByText('Auditor'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/roles');
  assert.deepEqual(post?.body, { name: 'Auditor', permissions: ['submit_request'] });
});

test('editing a system role shows the fixed-permissions notice and disables the picker', async () => {
  listBody = { rows: [hrHead], total: 1 };
  renderPage();
  await screen.findByText('HR Head');

  fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
  const dialog = screen.getByRole('dialog');
  assert.ok(within(dialog).getByText(/System role permissions are fixed/));
  const permissionButtons = within(dialog).getAllByRole('button').filter((b) => b.hasAttribute('disabled'));
  assert.ok(permissionButtons.length > 0);
});

test('archiving a custom role posts /archive and reloads', async () => {
  listBody = { rows: [financeApprover], total: 1 };
  renderPage();
  await screen.findByText('Finance Approver');

  listBody = { rows: [{ ...financeApprover, archived: true }], total: 1 };
  fireEvent.click(screen.getByLabelText('Archive Finance Approver'));

  assert.ok(await screen.findByText('Archived'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/roles/r2/archive'));
});

test('deleting a role still in use surfaces the reason and keeps the dialog open', async () => {
  listBody = { rows: [financeApprover], total: 1 };
  deleteStatus = 409;
  renderPage();
  await screen.findByText('Finance Approver');

  fireEvent.click(screen.getByLabelText('Delete Finance Approver'));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete role' }));

  assert.ok(await within(dialog).findByText('Still assigned to 3 members.'));
  assert.ok(screen.getByRole('dialog'));
});

test('filtering by type refetches with the selected filter', async () => {
  renderPage();
  await screen.findByText('No roles match your search.');
  fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(requests.some((r) => r.method === 'GET' && r.path.includes('type=custom')));
});
