import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { RegistrationsCountProvider } from '@/lib/registrationsCount';
import Registrations from './Registrations';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
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
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path.startsWith('/registrations?')) {
      return new Response(JSON.stringify(listBody), { status: 200 });
    }
    if (method === 'POST' && /\/registrations\/.+\/(accept|reject)$/.test(path)) {
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
        <RegistrationsCountProvider>
          <Registrations />
        </RegistrationsCountProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const pending = {
  id: 'r1',
  companyName: 'Acme Corp',
  industry: 'Manufacturing',
  contactName: 'Jane Doe',
  contactEmail: 'jane@acme.com',
  size: '50-100',
  createdAt: '2026-06-01T00:00:00.000Z',
  status: 'Pending',
};
const rejected = { ...pending, id: 'r2', companyName: 'Globex', status: 'Rejected', reviewNote: 'Incomplete details' };

test('renders a pending registration with Accept/Reject actions', async () => {
  listBody = { rows: [pending], total: 1 };
  renderPage();
  assert.ok(await screen.findByText('Acme Corp'));
  assert.ok(screen.getByRole('button', { name: /Accept/ }));
  assert.ok(screen.getByRole('button', { name: 'Reject' }));
});

test('shows the empty state when there are no registrations in view', async () => {
  renderPage();
  assert.ok(await screen.findByText('No registrations in this view.'));
});

test('Accept posts /accept and reloads the list', async () => {
  listBody = { rows: [pending], total: 1 };
  renderPage();
  await screen.findByText('Acme Corp');

  listBody = { rows: [], total: 0 };
  fireEvent.click(screen.getByRole('button', { name: /Accept/ }));

  assert.ok(await screen.findByText('No registrations in this view.'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/registrations/r1/accept'));
});

test('Reject requires a reason before submitting', async () => {
  listBody = { rows: [pending], total: 1 };
  renderPage();
  await screen.findByText('Acme Corp');

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm Rejection' }));

  assert.ok(await within(dialog).findByText('A reason is required.'));
  assert.equal(requests.some((r) => r.method === 'POST'), false);
});

test('Reject with a reason posts it and reloads the list', async () => {
  listBody = { rows: [pending], total: 1 };
  renderPage();
  await screen.findByText('Acme Corp');

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByPlaceholderText(/Incomplete company details/), {
    target: { value: 'Duplicate application' },
  });
  listBody = { rows: [], total: 0 };
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm Rejection' }));

  assert.ok(await screen.findByText('No registrations in this view.'));
  const reject = requests.find((r) => r.method === 'POST' && r.path === '/registrations/r1/reject');
  assert.ok(reject);
  assert.deepEqual(reject.body, { reason: 'Duplicate application' });
});

test('clicking a row opens the review overlay with its details', async () => {
  listBody = { rows: [pending], total: 1 };
  renderPage();
  await screen.findByText('Acme Corp');

  fireEvent.click(screen.getByText('Acme Corp'));
  const dialog = screen.getByRole('dialog');
  assert.ok(within(dialog).getByText('jane@acme.com'));
  assert.ok(within(dialog).getByRole('button', { name: /Accept & Activate/ }));
});

test('a non-pending row shows only a View action and a Close button in the overlay', async () => {
  listBody = { rows: [rejected], total: 1 };
  renderPage();
  await screen.findByText('Globex');

  assert.ok(screen.getByRole('button', { name: 'View' }));
  fireEvent.click(screen.getByRole('button', { name: 'View' }));
  const dialog = screen.getByRole('dialog');
  assert.ok(within(dialog).getByText('Incomplete details'));
  assert.ok(within(dialog).getByRole('button', { name: 'Close' }));
});

test('switching to "All registrations" refetches without a status filter', async () => {
  listBody = { rows: [pending], total: 1 };
  renderPage();
  await screen.findByText('Acme Corp');

  fireEvent.click(screen.getByRole('button', { name: 'All registrations' }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  const listCalls = requests.filter((r) => r.method === 'GET' && r.path.startsWith('/registrations?'));
  assert.ok(listCalls.some((r) => !r.path.includes('status=')));
});
