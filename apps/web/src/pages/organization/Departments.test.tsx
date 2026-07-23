import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import Departments from './Departments';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let listBody: { rows: unknown[]; total: number } = { rows: [], total: 0 };
let usersBody: unknown[] = [];
let deleteStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  listBody = { rows: [], total: 0 };
  usersBody = [];
  deleteStatus = 200;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path === '/org-users/options') return new Response(JSON.stringify(usersBody), { status: 200 });
    if (method === 'GET' && path.startsWith('/departments?')) return new Response(JSON.stringify(listBody), { status: 200 });
    if (method === 'POST' && path === '/departments') {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'd-new', name: body.name, heads: [], memberCount: 0, archived: false }), { status: 201 });
    }
    if (method === 'PUT' && path === '/departments/d1') {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'd1', name: body.name, heads: [], memberCount: 2, archived: false }), { status: 200 });
    }
    if (method === 'POST' && /\/departments\/.+\/(archive|unarchive)$/.test(path)) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (method === 'DELETE' && path === '/departments/d1') {
      if (deleteStatus !== 200) return new Response(JSON.stringify({ error: 'In use: 2 members reference this department.' }), { status: deleteStatus });
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
        <Departments />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const engineering = { id: 'd1', name: 'Engineering', heads: [{ id: 'u1', name: 'Ada Lovelace' }], memberCount: 5, archived: false };

test('renders department cards with head name and member count', async () => {
  listBody = { rows: [engineering], total: 1 };
  renderPage();
  assert.ok(await screen.findByText('Engineering'));
  assert.ok(screen.getByText('Ada Lovelace'));
  assert.ok(screen.getByText('5'));
});

test('shows the empty state when no departments match', async () => {
  renderPage();
  assert.ok(await screen.findByText('No departments match your search.'));
});

test('New Department requires a name, then creates and reloads', async () => {
  usersBody = [{ id: 'u2', name: 'Grace Hopper' }];
  renderPage();
  await screen.findByText('No departments match your search.');

  fireEvent.click(screen.getByRole('button', { name: /New Department/ }));
  const dialog = screen.getByRole('dialog');
  assert.ok(within(dialog).getByText('New department'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  assert.ok(await within(dialog).findByText('Department name is required.'));

  fireEvent.change(within(dialog).getByPlaceholderText('e.g. Design'), { target: { value: 'Design' } });
  fireEvent.click(within(dialog).getByText('Grace Hopper'));
  listBody = { rows: [{ ...engineering, id: 'd-new', name: 'Design', heads: [{ id: 'u2', name: 'Grace Hopper' }] }], total: 1 };
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  assert.ok(await screen.findByText('Design'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/departments');
  assert.ok(post);
  assert.deepEqual(post.body, { name: 'Design', headUserIds: ['u2'] });
});

test('Edit prefills the name and saves changes via PUT', async () => {
  listBody = { rows: [engineering], total: 1 };
  renderPage();
  await screen.findByText('Engineering');

  fireEvent.click(screen.getByRole('button', { name: 'Edit Engineering' }));
  const dialog = screen.getByRole('dialog');
  const nameInput = within(dialog).getByPlaceholderText('e.g. Design') as HTMLInputElement;
  assert.equal(nameInput.value, 'Engineering');

  fireEvent.change(nameInput, { target: { value: 'Engineering Team' } });
  listBody = { rows: [{ ...engineering, name: 'Engineering Team' }], total: 1 };
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  assert.ok(await screen.findByText('Engineering Team'));
  const put = requests.find((r) => r.method === 'PUT' && r.path === '/departments/d1');
  assert.ok(put);
});

test('the modal shows a placeholder when there are no users to pick as heads', async () => {
  listBody = { rows: [], total: 0 };
  usersBody = [];
  renderPage();
  await screen.findByText('No departments match your search.');
  fireEvent.click(screen.getByRole('button', { name: /New Department/ }));
  assert.ok(screen.getByText('No members yet. Add users first, then assign heads.'));
});

test('archiving posts /archive and reloads', async () => {
  listBody = { rows: [engineering], total: 1 };
  renderPage();
  await screen.findByText('Engineering');

  listBody = { rows: [{ ...engineering, archived: true }], total: 1 };
  fireEvent.click(screen.getByRole('button', { name: 'Archive Engineering' }));

  assert.ok(await screen.findByText('Archived'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/departments/d1/archive'));
});

test('deleting a department in use surfaces the reason and keeps the dialog open', async () => {
  listBody = { rows: [engineering], total: 1 };
  deleteStatus = 409;
  renderPage();
  await screen.findByText('Engineering');

  fireEvent.click(screen.getByRole('button', { name: 'Delete Engineering' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete department' }));

  assert.ok(await within(dialog).findByText('In use: 2 members reference this department.'));
  assert.ok(screen.getByRole('dialog'));
});

test('deleting an unused department succeeds and reloads the list', async () => {
  listBody = { rows: [engineering], total: 1 };
  renderPage();
  await screen.findByText('Engineering');

  listBody = { rows: [], total: 0 };
  fireEvent.click(screen.getByRole('button', { name: 'Delete Engineering' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete department' }));

  assert.ok(await screen.findByText('No departments match your search.'));
});
