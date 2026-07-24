import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import Enterprises from './Enterprises';

interface Recorded {
  method: string;
  path: string;
}

let requests: Recorded[] = [];
let listBody: { rows: unknown[]; total: number } = { rows: [], total: 0 };
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  listBody = { rows: [], total: 0 };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path });
    if (method === 'GET' && path.startsWith('/enterprises?')) {
      return new Response(JSON.stringify(listBody), { status: 200 });
    }
    if (method === 'POST' && /\/enterprises\/.+\/(suspend|reactivate)$/.test(path)) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
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
        <Enterprises />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const acme = {
  id: 'e1',
  name: 'Acme Corp',
  industry: 'Manufacturing',
  users: 42,
  since: '2026-01-01T00:00:00.000Z',
  status: 'Active',
};
const suspended = { ...acme, id: 'e2', name: 'Globex', status: 'Suspended' };

test('renders fetched enterprises with name/industry/status', async () => {
  listBody = { rows: [acme], total: 1 };
  renderPage();
  assert.ok(await screen.findByText('Acme Corp'));
  assert.ok(screen.getByText('Manufacturing'));
  // "Active" also appears as a status-filter <option>, so scope to the row itself.
  const row = screen.getByText('Acme Corp').closest('.grid') as HTMLElement;
  assert.ok(within(row).getByText('Active'));
});

test('shows the empty state when there are no enterprises', async () => {
  renderPage();
  assert.ok(await screen.findByText('No enterprises yet.'));
});

test('Suspend opens a confirm dialog; confirming posts /suspend and reloads the list', async () => {
  listBody = { rows: [acme], total: 1 };
  renderPage();
  await screen.findByText('Acme Corp');

  fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
  const dialog = screen.getByRole('dialog');
  assert.ok(within(dialog).getByText('Suspend enterprise'));

  listBody = { rows: [suspended], total: 1 };
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm Suspend' }));

  assert.ok(await screen.findByText('Globex'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/enterprises/e1/suspend'));
});

test('Cancel closes the suspend dialog without calling the API', async () => {
  listBody = { rows: [acme], total: 1 };
  renderPage();
  await screen.findByText('Acme Corp');

  fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(requests.some((r) => r.method === 'POST'), false);
});

test('Reactivate posts /reactivate and reloads the list', async () => {
  listBody = { rows: [suspended], total: 1 };
  renderPage();
  await screen.findByText('Globex');

  listBody = { rows: [acme], total: 1 };
  fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

  assert.ok(await screen.findByText('Acme Corp'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/enterprises/e2/reactivate'));
});
