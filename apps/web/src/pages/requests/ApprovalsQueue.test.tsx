import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AuthUser } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import ApprovalsQueue from './ApprovalsQueue';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let currentUser: AuthUser | null = null;
let queueStatus = 200;
let queueBody: Record<string, unknown> = { rows: [], awaitingCount: 0, decidedCount: 0 };
let decisionStatus = 200;
let decisionResultStatus = 'Pending Approval';
let detailByKey: Record<string, unknown> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  currentUser = null;
  queueStatus = 200;
  queueBody = { rows: [], awaitingCount: 0, decidedCount: 0 };
  decisionStatus = 200;
  decisionResultStatus = 'Pending Approval';
  detailByKey = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path === '/auth/me') return new Response(JSON.stringify(currentUser), { status: currentUser ? 200 : 401 });
    if (method === 'GET' && path.startsWith('/requests/approvals')) {
      if (queueStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load your approvals.' }), { status: queueStatus });
      return new Response(JSON.stringify(queueBody), { status: 200 });
    }
    if (method === 'POST' && /\/requests\/[^/]+\/decisions$/.test(path)) {
      if (decisionStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to approve this request.' }), { status: decisionStatus });
      return new Response(JSON.stringify({ id: 'r1', status: decisionResultStatus }), { status: 200 });
    }
    const detailMatch = path.match(/^\/requests\/([^/?]+)$/);
    if (method === 'GET' && detailMatch) return new Response(JSON.stringify(detailByKey[detailMatch[1]] ?? null), { status: 200 });
    return new Response(JSON.stringify({ error: `No stub for ${method} ${path}` }), { status: 500 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  localStorage.clear();
  cleanup();
});

function loginAs(id: string) {
  currentUser = {
    id, name: 'Ada Lovelace', email: 'ada@acme.com', isSystemAdmin: false, mustChangePassword: false,
    tenantId: 't1', tenantName: 'Acme', roles: ['project-manager'],
  };
  localStorage.setItem('se.accessToken', 'at-1');
  localStorage.setItem('se.refreshToken', 'rt-1');
}

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <ApprovalsQueue />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const pendingRow = {
  requestId: 'r1',
  formKey: 'leave',
  formTitle: 'Leave Request',
  requesterName: 'Bob',
  requesterJobTitle: 'Designer',
  startDate: '2026-07-10',
  endDate: '2026-07-12',
  submittedAt: '2026-07-01T00:00:00.000Z',
  chain: [{ approverId: 'me', approverName: 'Ada Lovelace', roleContext: 'project-manager', decision: 'pending' }],
  myDecision: 'pending',
};

test('renders a pending row with requester, job title, dates, and chain entry', async () => {
  queueBody = { rows: [pendingRow], awaitingCount: 1, decidedCount: 0 };
  renderPage();
  assert.ok(await screen.findByText('Bob'));
  assert.ok(screen.getByText('· Designer'));
  assert.ok(screen.getByText('AL'));
  assert.ok(screen.getByText('Project Manager'));
});

test('shows the empty state and an error state with Retry', async () => {
  renderPage();
  assert.ok(await screen.findByText('All caught up'));
  queueStatus = 500;
  fireEvent.click(screen.getByRole('button', { name: /Decided/ }));
  assert.ok(await screen.findByText('Unable to load your approvals.'));
  queueStatus = 200;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.ok(await screen.findByText('All caught up'));
});

test('Approve on the final decision toasts "Request approved."', async () => {
  queueBody = { rows: [pendingRow], awaitingCount: 1, decidedCount: 0 };
  decisionResultStatus = 'Approved';
  renderPage();
  await screen.findByText('Bob');

  queueBody = { rows: [], awaitingCount: 0, decidedCount: 1 };
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

  assert.ok(await screen.findByText('Request approved.'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/requests/r1/decisions');
  assert.deepEqual(post?.body, { decision: 'approved' });
});

test('Approve on a partial decision toasts the awaiting-others message', async () => {
  queueBody = { rows: [pendingRow], awaitingCount: 1, decidedCount: 0 };
  renderPage();
  await screen.findByText('Bob');
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  assert.ok(await screen.findByText('Your approval was recorded — awaiting other approvers.'));
});

test('a failed approve shows an inline error on the row', async () => {
  queueBody = { rows: [pendingRow], awaitingCount: 1, decidedCount: 0 };
  decisionStatus = 400;
  renderPage();
  await screen.findByText('Bob');
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  assert.ok(await screen.findByText('Unable to approve this request.'));
});

test('Reject requires a reason, then posts it and toasts "Request rejected."', async () => {
  queueBody = { rows: [pendingRow], awaitingCount: 1, decidedCount: 0 };
  renderPage();
  await screen.findByText('Bob');

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Rejection/ }));
  assert.ok(await within(dialog).findByText('A reason is required.'));

  fireEvent.change(within(dialog).getByLabelText('Reason for rejection'), { target: { value: 'Conflicts with release' } });
  queueBody = { rows: [], awaitingCount: 0, decidedCount: 1 };
  fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Rejection/ }));

  assert.ok(await screen.findByText('Request rejected.'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/requests/r1/decisions');
  assert.deepEqual(post?.body, { decision: 'rejected', comment: 'Conflicts with release' });
});

test('the Decided tab shows a "You rejected" decision badge instead of actions', async () => {
  queueBody = { rows: [{ ...pendingRow, myDecision: 'rejected' }], awaitingCount: 0, decidedCount: 1 };
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: /Decided/ }));
  assert.ok(await screen.findByText('You rejected'));
  assert.equal(screen.queryByRole('button', { name: 'Approve' }), null);
});

test('"Approving as" only appears with more than one role context, and switching refetches', async () => {
  loginAs('me');
  queueBody = {
    rows: [
      { ...pendingRow, chain: [{ approverId: 'me', approverName: 'Ada Lovelace', roleContext: 'project-manager', decision: 'pending' }] },
    ],
    awaitingCount: 1,
    decidedCount: 0,
  };
  renderPage();
  await screen.findByText('Bob');
  assert.equal(screen.queryByText('Approving as'), null);

  queueBody = {
    rows: [
      { ...pendingRow, requestId: 'r2', chain: [{ approverId: 'me', approverName: 'Ada Lovelace', roleContext: 'tech-lead', decision: 'pending' }] },
    ],
    awaitingCount: 1,
    decidedCount: 0,
  };
  fireEvent.click(screen.getByRole('button', { name: /Decided/ }));
  fireEvent.click(screen.getByRole('button', { name: /Awaiting you/ }));
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.ok(await screen.findByText('Approving as'));
  assert.ok(screen.getByRole('button', { name: 'Project Manager' }));
  assert.ok(screen.getByRole('button', { name: 'Tech Lead' }));

  fireEvent.click(screen.getByRole('button', { name: 'Tech Lead' }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(requests.some((r) => r.path.includes('roleContext=tech-lead')));
});

test('clicking a row opens the detail drawer', async () => {
  queueBody = { rows: [pendingRow], awaitingCount: 1, decidedCount: 0 };
  detailByKey = {
    r1: {
      id: 'r1', formKey: 'leave', formTitle: 'Leave Request', status: 'Pending Approval',
      startDate: '2026-07-10', endDate: '2026-07-12', createdAt: '2026-07-01T00:00:00.000Z',
      requesterId: 'someone', approvers: [],
      definition: { id: 'def_leave', key: 'leave', title: 'Leave Request', version: 1, renderer: 'custom', status: 'published', sections: [] },
      payload: {},
    },
  };
  renderPage();
  await screen.findByText('Bob');
  fireEvent.click(screen.getByText('Bob'));
  assert.ok(await screen.findByRole('dialog'));
  assert.ok(requests.some((r) => r.path === '/requests/r1'));
});
