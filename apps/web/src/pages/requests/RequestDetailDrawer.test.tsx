import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AuthUser } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import { RequestDetailDrawer } from './RequestDetailDrawer';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let currentUser: AuthUser | null = null;
let detailBody: Record<string, unknown> | null = null;
let detailStatus = 200;
let transitionStatus = 200;
const realFetch = globalThis.fetch;

function baseDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    formKey: 'leave',
    formTitle: 'Leave Request',
    status: 'Submitted',
    startDate: '2026-07-10',
    endDate: '2026-07-12',
    createdAt: '2026-07-01T00:00:00.000Z',
    requesterId: 'u1',
    approvers: [],
    definition: {
      id: 'def_leave', key: 'leave', title: 'Leave Request', version: 1, renderer: 'custom', status: 'published',
      sections: [],
      statusModel: { states: ['Submitted', 'Approved', 'Withdrawn'], transitions: [{ from: 'Submitted', to: 'Withdrawn', roles: ['requester'] }] },
    },
    payload: {},
    ...overrides,
  };
}

beforeEach(() => {
  requests = [];
  currentUser = null;
  detailBody = null;
  detailStatus = 200;
  transitionStatus = 200;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path === '/auth/me') return new Response(JSON.stringify(currentUser), { status: currentUser ? 200 : 401 });
    if (method === 'GET' && /^\/requests\/[^/]+$/.test(path)) {
      if (detailStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load this request.' }), { status: detailStatus });
      return new Response(JSON.stringify(detailBody), { status: 200 });
    }
    if (method === 'POST' && /\/requests\/[^/]+\/transitions$/.test(path)) {
      if (transitionStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to withdraw this request.' }), { status: transitionStatus });
      return new Response(JSON.stringify({ ...detailBody, status: 'Withdrawn' }), { status: 200 });
    }
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
    tenantId: 't1', tenantName: 'Acme', roles: ['employee'],
  };
}

function renderDrawer(onClose = () => {}, onWithdrawn = () => {}) {
  return render(
    <AuthProvider>
      <RequestDetailDrawer requestId="r1" onClose={onClose} onWithdrawn={onWithdrawn} />
    </AuthProvider>,
  );
}

test('renders the request title, type, status, dates, and approver count', async () => {
  detailBody = baseDetail({ approvers: [{ approverId: 'a1', approverName: 'Grace Hopper', roleContext: 'hr-head', decision: 'pending' }] });
  renderDrawer();
  assert.ok(await screen.findByText('Leave Request'));
  assert.ok(screen.getByText('Submitted'));
  assert.ok(screen.getByText('0/1 decided'));
  assert.ok(screen.getByText('Jul 10 – Jul 12'));
});

test('shows "No approval required" when there are no approvers', async () => {
  detailBody = baseDetail({ approvers: [] });
  renderDrawer();
  await screen.findByText('Leave Request');
  assert.ok(screen.getByText('No approval required'));
});

test('shows an error message on a load failure', async () => {
  detailStatus = 500;
  renderDrawer();
  assert.ok(await screen.findByText('Unable to load this request.'));
});

test('renders the approval chain with role label, decision badge, escalation, and rejection reason', async () => {
  detailBody = baseDetail({
    status: 'Rejected',
    approvers: [
      { approverId: 'a1', approverName: 'Grace Hopper', roleContext: 'hr-head', decision: 'rejected', comment: 'Missing details', escalatedFromName: null, escalationCause: null },
      { approverId: 'a2', approverName: 'Bob', roleContext: 'tech-lead', decision: 'pending', escalatedFromName: 'Ada Lovelace', escalationCause: 'timeout' },
    ],
  });
  renderDrawer();
  await screen.findByText('Leave Request');
  assert.ok(screen.getByText('Grace Hopper'));
  assert.ok(screen.getByText('HR Head'));
  assert.ok(screen.getByText('Missing details'));
  assert.ok(screen.getByText(/Escalated from Ada Lovelace/));
  assert.ok(screen.getByText(/didn't act in time/));
});

test('the requester sees Withdraw when no approver has decided, and it transitions the request', async () => {
  loginAs('u1');
  detailBody = baseDetail({ requesterId: 'u1', approvers: [] });
  let withdrawn = 0;
  renderDrawer(() => {}, () => (withdrawn += 1));
  await screen.findByText('Leave Request');

  fireEvent.click(screen.getByRole('button', { name: /Withdraw/ }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(withdrawn, 1);
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/requests/r1/transitions' && (r.body as { toState: string }).toState === 'Withdrawn'));
});

test('Withdraw is hidden once any approver has decided (partial approval blocks it)', async () => {
  loginAs('u1');
  detailBody = baseDetail({
    requesterId: 'u1',
    approvers: [{ approverId: 'a1', approverName: 'Grace Hopper', roleContext: 'hr-head', decision: 'approved' }],
  });
  renderDrawer();
  await screen.findByText('Leave Request');
  assert.equal(screen.queryByRole('button', { name: /Withdraw/ }), null);
});

test('Withdraw is hidden to a viewer who is not the requester', async () => {
  loginAs('someone-else');
  detailBody = baseDetail({ requesterId: 'u1', approvers: [] });
  renderDrawer();
  await screen.findByText('Leave Request');
  assert.equal(screen.queryByRole('button', { name: /Withdraw/ }), null);
});

test('Close calls onClose', async () => {
  detailBody = baseDetail();
  let closed = 0;
  renderDrawer(() => (closed += 1));
  await screen.findByText('Leave Request');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  assert.equal(closed, 1);
});
