import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import AuditLog from './AuditLog';

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
    if (method === 'GET' && path.startsWith('/audit-log?')) {
      return new Response(JSON.stringify(listBody), { status: 200 });
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
      <AuditLog />
    </AuthProvider>,
  );
}

const acceptedRow = {
  id: 'a1',
  at: '2026-06-01T00:00:00.000Z',
  actor: 'Ada',
  actorId: 'u1',
  tenant: 'Acme',
  tenantId: 't1',
  entity: 'EnterpriseRegistration',
  entityId: 'er1',
  action: 'accept',
  before: { status: 'Pending' },
  after: { status: 'Active' },
};

test('renders fetched audit entries with actor/tenant/label', async () => {
  listBody = { rows: [acceptedRow], total: 1 };
  renderPage();
  assert.ok(await screen.findByText('Acme'));
  assert.ok(screen.getByText('Ada'));
  assert.ok(screen.getByText('EnterpriseRegistration'));
});

test('shows the empty state when no entries match', async () => {
  renderPage();
  assert.ok(await screen.findByText('No audit entries match your filters.'));
});

test('clicking a row with before/after details expands it, and again collapses it', async () => {
  listBody = { rows: [acceptedRow], total: 1 };
  renderPage();
  await screen.findByText('Acme');

  fireEvent.click(screen.getByText('EnterpriseRegistration'));
  assert.ok(await screen.findByText('status: Pending'));
  assert.ok(screen.getByText('status: Active'));

  fireEvent.click(screen.getByText('EnterpriseRegistration'));
  assert.equal(screen.queryByText('status: Pending'), null);
});

test('Prev is disabled on page 1 and Next is disabled with no further rows', async () => {
  listBody = { rows: [acceptedRow], total: 1 };
  renderPage();
  await screen.findByText('Acme');
  assert.equal(screen.getByRole('button', { name: 'Prev' }).hasAttribute('disabled'), true);
  assert.equal(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled'), true);
});

test('changing the action filter refetches with the selected action', async () => {
  renderPage();
  await screen.findByText('No audit entries match your filters.');

  fireEvent.change(screen.getByDisplayValue('All Actions'), { target: { value: 'reject' } });

  // No debounce on the action filter (unlike search) — the refetch effect runs on the next tick.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(requests.some((r) => r.path.includes('action=reject')));
});
