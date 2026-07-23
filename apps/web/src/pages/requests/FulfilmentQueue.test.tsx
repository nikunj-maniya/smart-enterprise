import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import FulfilmentQueue from './FulfilmentQueue';

interface Recorded {
  method: string;
  path: string;
}

let requests: Recorded[] = [];
let queueStatus = 200;
let queueBody: Record<string, unknown> = { rows: [], queuedCount: 0, inProgressCount: 0, fulfilledCount: 0 };
let actionStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  queueStatus = 200;
  queueBody = { rows: [], queuedCount: 0, inProgressCount: 0, fulfilledCount: 0 };
  actionStatus = 200;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path });
    if (method === 'GET' && path.startsWith('/requests/fulfilment-queue')) {
      if (queueStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load the fulfilment queue.' }), { status: queueStatus });
      return new Response(JSON.stringify(queueBody), { status: 200 });
    }
    if (method === 'POST' && /\/requests\/[^/]+\/claim$/.test(path)) {
      if (actionStatus !== 200) return new Response(JSON.stringify({ error: 'Already claimed by someone else.' }), { status: actionStatus });
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && /\/requests\/[^/]+\/transitions$/.test(path)) {
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
      <FulfilmentQueue />
    </AuthProvider>,
  );
}

const queuedRow = {
  requestId: 'r1',
  requesterName: 'Ada Lovelace',
  status: 'Approved',
  category: 'Hardware',
  impact: 'Blocker',
  items: ['Laptop', 'Mouse'],
  assigneeId: null,
  assigneeName: null,
  approvedAt: '2026-07-01T10:00:00.000Z',
  fulfilledAt: null,
};
const assignedRow = { ...queuedRow, requestId: 'r2', assigneeId: 'u2', assigneeName: 'Bob' };
const inProgressRow = { ...assignedRow, requestId: 'r3', status: 'In Progress' };

test('renders stat cards from the queue counts', async () => {
  queueBody = { rows: [], queuedCount: 4, inProgressCount: 2, fulfilledCount: 9 };
  renderPage();
  assert.ok(await screen.findByText('4'));
  assert.ok(screen.getByText('Queued'));
  assert.ok(screen.getByText('2'));
  assert.ok(screen.getByText('9'));
});

test('renders a queue card with requester, category, impact, items, and assignee', async () => {
  queueBody = { rows: [queuedRow], queuedCount: 1, inProgressCount: 0, fulfilledCount: 0 };
  renderPage();
  assert.ok(await screen.findByText('Ada Lovelace'));
  assert.ok(screen.getByText('Hardware'));
  assert.ok(screen.getByText('Blocker'));
  assert.ok(screen.getByText('Laptop'));
  assert.ok(screen.getByText('Assignee: Unassigned'));
});

test('shows the empty state for the active tab and switching tabs refetches', async () => {
  renderPage();
  assert.ok(await screen.findByText('No open fulfilment requests.'));
  fireEvent.click(screen.getByRole('button', { name: 'Fulfilled' }));
  assert.ok(await screen.findByText('No fulfilled requests yet.'));
  assert.ok(requests.some((r) => r.path.includes('tab=fulfilled')));
});

test('Assign to me claims the request, toasts, and reloads', async () => {
  queueBody = { rows: [queuedRow], queuedCount: 1, inProgressCount: 0, fulfilledCount: 0 };
  renderPage();
  await screen.findByText('Ada Lovelace');

  queueBody = { rows: [assignedRow], queuedCount: 0, inProgressCount: 1, fulfilledCount: 0 };
  fireEvent.click(screen.getByRole('button', { name: /Assign to me/ }));

  assert.ok(await screen.findByText('Assigned to you.'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/requests/r1/claim'));
});

test('Start Fulfilment transitions to In Progress, toasts, and reloads', async () => {
  queueBody = { rows: [assignedRow], queuedCount: 1, inProgressCount: 0, fulfilledCount: 0 };
  renderPage();
  await screen.findByText('Ada Lovelace');
  assert.ok(screen.getByText('Assignee: Bob'));

  queueBody = { rows: [inProgressRow], queuedCount: 0, inProgressCount: 1, fulfilledCount: 0 };
  fireEvent.click(screen.getByRole('button', { name: /Start Fulfilment/ }));

  assert.ok(await screen.findByText('Fulfilment started.'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/requests/r2/transitions'));
});

test('Hand Over transitions to Fulfilled, toasts, and reloads', async () => {
  queueBody = { rows: [inProgressRow], queuedCount: 0, inProgressCount: 1, fulfilledCount: 0 };
  renderPage();
  await screen.findByText('Ada Lovelace');

  queueBody = { rows: [], queuedCount: 0, inProgressCount: 0, fulfilledCount: 1 };
  fireEvent.click(screen.getByRole('button', { name: /Hand Over/ }));

  assert.ok(await screen.findByText('Request handed over.'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/requests/r3/transitions'));
});

test('a failed claim shows an inline error on the card', async () => {
  queueBody = { rows: [queuedRow], queuedCount: 1, inProgressCount: 0, fulfilledCount: 0 };
  actionStatus = 409;
  renderPage();
  await screen.findByText('Ada Lovelace');
  fireEvent.click(screen.getByRole('button', { name: /Assign to me/ }));
  assert.ok(await screen.findByText('Already claimed by someone else.'));
});

test('shows an error state with a working Retry on a load failure', async () => {
  queueStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load the fulfilment queue.'));
  queueStatus = 200;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.ok(await screen.findByText('No open fulfilment requests.'));
});
