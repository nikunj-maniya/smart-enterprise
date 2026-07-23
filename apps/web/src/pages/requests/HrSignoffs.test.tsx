import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import HrSignoffs from './HrSignoffs';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let queueStatus = 200;
let queueBody: Record<string, unknown> = { rows: [], awaitingCount: 0, decidedCount: 0 };
let decisionStatus = 200;
let decisionResultStatus = 'Pending Approval';
let detailByKey: Record<string, unknown> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  queueStatus = 200;
  queueBody = { rows: [], awaitingCount: 0, decidedCount: 0 };
  decisionStatus = 200;
  decisionResultStatus = 'Pending Approval';
  detailByKey = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path.startsWith('/requests/approvals')) {
      if (queueStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load HR sign-offs.' }), { status: queueStatus });
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
  cleanup();
});

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <HrSignoffs />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const pendingRow = {
  requestId: 'r1',
  formKey: 'leave',
  formTitle: 'Leave Request',
  requesterName: 'Ada Lovelace',
  requesterJobTitle: 'Engineer',
  startDate: '2026-07-10',
  endDate: '2026-07-12',
  submittedAt: '2026-07-01T00:00:00.000Z',
  overBalance: true,
  specialConditionFlagged: false,
  chain: [{ approverId: 'a1', approverName: 'Grace Hopper', roleContext: 'tech-lead', decision: 'approved' }],
  myDecision: 'pending',
};

test('renders a pending row with requester, job title, dates, and the over-balance flag', async () => {
  queueBody = { rows: [pendingRow], awaitingCount: 1, decidedCount: 0 };
  renderPage();
  assert.ok(await screen.findByText('Ada Lovelace'));
  assert.ok(screen.getByText('· Engineer'));
  assert.ok(screen.getByText('Over balance'));
  // The chain entry shows the approver's initials avatar and role, not their full name.
  assert.ok(screen.getByText('GH'));
  assert.ok(screen.getByText('Tech Lead'));
});

test('shows the empty state and an error state with Retry', async () => {
  renderPage();
  assert.ok(await screen.findByText('All caught up'));

  queueStatus = 500;
  fireEvent.click(screen.getByRole('button', { name: /Decided/ }));
  assert.ok(await screen.findByText('Unable to load HR sign-offs.'));
  queueStatus = 200;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.ok(await screen.findByText('All caught up'));
});

test('Approve on the final decision toasts "Request approved."', async () => {
  queueBody = { rows: [pendingRow], awaitingCount: 1, decidedCount: 0 };
  decisionResultStatus = 'Approved';
  renderPage();
  await screen.findByText('Ada Lovelace');

  queueBody = { rows: [], awaitingCount: 0, decidedCount: 1 };
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

  assert.ok(await screen.findByText('Request approved.'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/requests/r1/decisions');
  assert.deepEqual(post?.body, { decision: 'approved' });
});

test('Approve on a partial decision toasts the awaiting-others message', async () => {
  queueBody = { rows: [pendingRow], awaitingCount: 1, decidedCount: 0 };
  decisionResultStatus = 'Pending Approval';
  renderPage();
  await screen.findByText('Ada Lovelace');
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  assert.ok(await screen.findByText('Your approval was recorded — awaiting other approvers.'));
});

test('Decline requires a reason, then posts it and toasts', async () => {
  queueBody = { rows: [pendingRow], awaitingCount: 1, decidedCount: 0 };
  renderPage();
  await screen.findByText('Ada Lovelace');

  fireEvent.click(screen.getByRole('button', { name: /Decline/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Decline/ }));
  assert.ok(await within(dialog).findByText('A reason is required.'));

  fireEvent.change(within(dialog).getByLabelText('Reason for declining'), { target: { value: 'Exceeds balance' } });
  queueBody = { rows: [], awaitingCount: 0, decidedCount: 1 };
  fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Decline/ }));

  assert.ok(await screen.findByText('Request declined.'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/requests/r1/decisions');
  assert.deepEqual(post?.body, { decision: 'rejected', comment: 'Exceeds balance' });
});

test('a failed approve shows an inline error on the row', async () => {
  queueBody = { rows: [pendingRow], awaitingCount: 1, decidedCount: 0 };
  decisionStatus = 400;
  renderPage();
  await screen.findByText('Ada Lovelace');
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  assert.ok(await screen.findByText('Unable to approve this request.'));
});

test('the Decided tab shows a "You approved" decision badge instead of actions', async () => {
  queueBody = { rows: [{ ...pendingRow, myDecision: 'approved' }], awaitingCount: 0, decidedCount: 1 };
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: /Decided/ }));
  assert.ok(await screen.findByText('You approved'));
  assert.equal(screen.queryByRole('button', { name: 'Approve' }), null);
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
  await screen.findByText('Ada Lovelace');
  fireEvent.click(screen.getByText('Ada Lovelace'));
  assert.ok(await screen.findByRole('dialog'));
  assert.ok(requests.some((r) => r.path === '/requests/r1'));
});
