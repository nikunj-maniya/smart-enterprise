import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import Projects from './Projects';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let listBody: { rows: unknown[]; total: number } = { rows: [], total: 0 };
let usersBody: unknown[] = [];
let pmOptionsBody: unknown[] = [];
let tlOptionsBody: unknown[] = [];
let deleteStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  listBody = { rows: [], total: 0 };
  usersBody = [];
  pmOptionsBody = [];
  tlOptionsBody = [];
  deleteStatus = 200;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path === '/org-users/options') return new Response(JSON.stringify(usersBody), { status: 200 });
    if (method === 'GET' && path.includes('role=project-manager')) return new Response(JSON.stringify(pmOptionsBody), { status: 200 });
    if (method === 'GET' && path.includes('role=tech-lead')) return new Response(JSON.stringify(tlOptionsBody), { status: 200 });
    if (method === 'GET' && path.startsWith('/projects?')) return new Response(JSON.stringify(listBody), { status: 200 });
    if (method === 'POST' && path === '/projects') {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'p-new', ...body, pm: null, techLead: null, memberCount: 0 }), { status: 201 });
    }
    if (method === 'PUT' && path.startsWith('/projects/')) {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: path.split('/')[2], ...body }), { status: 200 });
    }
    if (method === 'DELETE' && path.startsWith('/projects/')) {
      if (deleteStatus !== 200) return new Response(JSON.stringify({ error: 'Still has assigned members.' }), { status: deleteStatus });
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
        <Projects />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const apollo = {
  id: 'p1',
  name: 'Apollo Platform',
  status: 'active',
  pm: { id: 'u1', name: 'Ada Lovelace' },
  techLead: { id: 'u2', name: 'Grace Hopper' },
  members: [{ id: 'u3', name: 'Bob' }],
  memberCount: 1,
};

test('renders a project row with PM, Tech Lead, member count, and status', async () => {
  listBody = { rows: [apollo], total: 1 };
  renderPage();
  assert.ok(await screen.findByText('Apollo Platform'));
  assert.ok(screen.getByText('Ada Lovelace'));
  assert.ok(screen.getByText('Grace Hopper'));
  assert.ok(screen.getByText('1'));
  assert.equal((screen.getByLabelText('Project status') as HTMLSelectElement).value, 'active');
});

test('shows the empty state when no projects match', async () => {
  renderPage();
  assert.ok(await screen.findByText('No projects match your search.'));
});

test('changing the inline status select PUTs the update and reloads', async () => {
  listBody = { rows: [apollo], total: 1 };
  renderPage();
  await screen.findByText('Apollo Platform');

  listBody = { rows: [{ ...apollo, status: 'archived' }], total: 1 };
  fireEvent.change(screen.getByLabelText('Project status'), { target: { value: 'archived' } });

  await new Promise((resolve) => setTimeout(resolve, 20));
  const put = requests.find((r) => r.method === 'PUT' && r.path === '/projects/p1');
  assert.ok(put);
  assert.deepEqual(put.body, {
    name: 'Apollo Platform',
    status: 'archived',
    pmUserId: 'u1',
    techLeadUserId: 'u2',
    memberIds: ['u3'],
  });
});

test('New Project requires a name and a distinct PM/Tech Lead, then creates it', async () => {
  pmOptionsBody = [{ id: 'u1', name: 'Ada Lovelace' }];
  // 'u1' must be a valid option in both selects for the invalid same-value change below to stick.
  tlOptionsBody = [{ id: 'u1', name: 'Ada Lovelace' }, { id: 'u2', name: 'Grace Hopper' }];
  renderPage();
  await screen.findByText('No projects match your search.');

  fireEvent.click(screen.getByRole('button', { name: /New Project/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  assert.ok(await within(dialog).findByText('Project name is required.'));

  fireEvent.change(within(dialog).getByPlaceholderText('e.g. Apollo Platform'), { target: { value: 'Apollo' } });
  fireEvent.change(within(dialog).getByLabelText('Project Manager'), { target: { value: 'u1' } });
  fireEvent.change(within(dialog).getByLabelText('Tech Lead'), { target: { value: 'u1' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  assert.ok(await within(dialog).findByText('The PM and Tech Lead must be different people.'));

  fireEvent.change(within(dialog).getByLabelText('Tech Lead'), { target: { value: 'u2' } });
  listBody = { rows: [{ ...apollo, id: 'p-new', name: 'Apollo' }], total: 1 };
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  assert.ok(await screen.findByText('Apollo'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/projects');
  assert.deepEqual(post?.body, { name: 'Apollo', status: 'active', pmUserId: 'u1', techLeadUserId: 'u2', memberIds: [] });
});

test('Edit prefills PM/Tech Lead/status and saves via PUT', async () => {
  listBody = { rows: [apollo], total: 1 };
  pmOptionsBody = [{ id: 'u1', name: 'Ada Lovelace' }];
  tlOptionsBody = [{ id: 'u2', name: 'Grace Hopper' }];
  renderPage();
  await screen.findByText('Apollo Platform');

  fireEvent.click(screen.getAllByRole('button', { name: /Edit/ })[0]);
  const dialog = screen.getByRole('dialog');
  assert.equal((within(dialog).getByLabelText('Project Manager') as HTMLSelectElement).value, 'u1');
  assert.equal((within(dialog).getByLabelText('Tech Lead') as HTMLSelectElement).value, 'u2');

  fireEvent.change(within(dialog).getByPlaceholderText('e.g. Apollo Platform'), { target: { value: 'Apollo Platform v2' } });
  listBody = { rows: [{ ...apollo, name: 'Apollo Platform v2' }], total: 1 };
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  assert.ok(await screen.findByText('Apollo Platform v2'));
  assert.ok(requests.some((r) => r.method === 'PUT' && r.path === '/projects/p1'));
});

test('editing keeps a since-removed PM selectable via mergeCurrent', async () => {
  listBody = { rows: [apollo], total: 1 };
  pmOptionsBody = []; // Ada no longer holds the PM role, so she's absent from the fresh options list.
  renderPage();
  await screen.findByText('Apollo Platform');

  fireEvent.click(screen.getAllByRole('button', { name: /Edit/ })[0]);
  const dialog = screen.getByRole('dialog');
  assert.equal((within(dialog).getByLabelText('Project Manager') as HTMLSelectElement).value, 'u1');
  assert.ok(within(dialog).getByRole('option', { name: 'Ada Lovelace' }));
});

test('deleting a project with assignments surfaces the reason and keeps the dialog open', async () => {
  listBody = { rows: [apollo], total: 1 };
  deleteStatus = 409;
  renderPage();
  await screen.findByText('Apollo Platform');

  fireEvent.click(screen.getByLabelText('Delete Apollo Platform'));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));

  assert.ok(await within(dialog).findByText('Still has assigned members.'));
  assert.ok(screen.getByRole('dialog'));
});

test('deleting an unassigned project succeeds and reloads', async () => {
  listBody = { rows: [apollo], total: 1 };
  renderPage();
  await screen.findByText('Apollo Platform');

  listBody = { rows: [], total: 0 };
  fireEvent.click(screen.getByLabelText('Delete Apollo Platform'));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete project' }));

  assert.ok(await screen.findByText('No projects match your search.'));
});
