import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import PlatformUsers from './PlatformUsers';

interface Recorded {
  method: string;
  path: string;
}

let requests: Recorded[] = [];
let usersBody: { rows: unknown[]; total: number } = { rows: [], total: 0 };
let enterprisesBody: { rows: unknown[]; total: number } = { rows: [], total: 0 };
let resetStatus = 200;
let resetBody: unknown = { temporaryPassword: 'Tmp-Pass-123' };
let clipboardWrites: string[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  usersBody = { rows: [], total: 0 };
  enterprisesBody = { rows: [], total: 0 };
  resetStatus = 200;
  resetBody = { temporaryPassword: 'Tmp-Pass-123' };
  clipboardWrites = [];
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (text: string) => void clipboardWrites.push(text) },
    configurable: true,
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path });
    if (method === 'GET' && path.startsWith('/enterprises?')) {
      return new Response(JSON.stringify(enterprisesBody), { status: 200 });
    }
    if (method === 'GET' && path.startsWith('/users?')) {
      return new Response(JSON.stringify(usersBody), { status: 200 });
    }
    if (method === 'POST' && /\/users\/.+\/reset-password$/.test(path)) {
      return new Response(JSON.stringify(resetStatus === 200 ? resetBody : { error: resetBody }), { status: resetStatus });
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
        <PlatformUsers />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const jane = {
  id: 'u1',
  name: 'Jane Doe',
  email: 'jane@acme.com',
  enterpriseName: 'Acme Corp',
  role: 'HR Head',
  status: 'Active',
};

test('renders fetched users with enterprise/role/status', async () => {
  usersBody = { rows: [jane], total: 1 };
  renderPage();
  assert.ok(await screen.findByText('Jane Doe'));
  assert.ok(screen.getByText('jane@acme.com'));
  assert.ok(screen.getByText('Acme Corp'));
  assert.ok(screen.getByText('HR Head'));
});

test('shows the empty state when no users match', async () => {
  renderPage();
  assert.ok(await screen.findByText('No users match your filters.'));
});

test('loads enterprise names into the filter dropdown', async () => {
  enterprisesBody = { rows: [{ id: 'e1', name: 'Acme Corp' }], total: 1 };
  renderPage();
  await screen.findByText('No users match your filters.');
  assert.ok(screen.getByRole('option', { name: 'Acme Corp' }));
});

test('Reset Password confirms, posts, and shows the temporary password to copy', async () => {
  usersBody = { rows: [jane], total: 1 };
  renderPage();
  await screen.findByText('Jane Doe');

  fireEvent.click(screen.getByRole('button', { name: /Reset Password/ }));
  const dialog = screen.getByRole('dialog');
  assert.ok(within(dialog).getByText('Reset password'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reset Password' }));

  assert.ok(await screen.findByText('Tmp-Pass-123'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/users/u1/reset-password'));

  fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
  assert.ok(await screen.findByText('Copied'));
  assert.deepEqual(clipboardWrites, ['Tmp-Pass-123']);
});

test('a failed reset surfaces the error inside the confirm dialog and keeps it open', async () => {
  usersBody = { rows: [jane], total: 1 };
  resetStatus = 400;
  resetBody = 'Unable to reset the password.';
  renderPage();
  await screen.findByText('Jane Doe');

  fireEvent.click(screen.getByRole('button', { name: /Reset Password/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset Password' }));

  assert.ok(await screen.findByText('Unable to reset the password.'));
  assert.ok(screen.getByRole('dialog'));
});
