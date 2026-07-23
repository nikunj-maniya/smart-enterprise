import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import MyRequests from './MyRequests';

interface Recorded {
  method: string;
  path: string;
}

let requests: Recorded[] = [];
let myRequestsStatus = 200;
let myRequestsBody: { rows: unknown[] } = { rows: [] };
let balancesBody: unknown[] = [];
let detailByKey: Record<string, unknown> = {};
const realFetch = globalThis.fetch;

function minimalDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    formKey: 'leave',
    formTitle: 'Leave Request',
    status: 'Pending Approval',
    startDate: '2026-07-10',
    endDate: '2026-07-12',
    createdAt: '2026-07-01T00:00:00.000Z',
    requesterId: 'u1',
    approvers: [],
    definition: { id: 'def_leave', key: 'leave', title: 'Leave Request', version: 1, renderer: 'custom', status: 'published', sections: [] },
    payload: {},
    ...overrides,
  };
}

beforeEach(() => {
  requests = [];
  myRequestsStatus = 200;
  myRequestsBody = { rows: [] };
  balancesBody = [];
  detailByKey = {};
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = String(input).replace('http://localhost:4000', '');
    requests.push({ method: 'GET', path });
    if (path.startsWith('/requests?')) {
      if (myRequestsStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load your requests.' }), { status: myRequestsStatus });
      return new Response(JSON.stringify(myRequestsBody), { status: 200 });
    }
    if (path === '/leave-balances/me') {
      return new Response(JSON.stringify(balancesBody), { status: 200 });
    }
    const detailMatch = path.match(/^\/requests\/([^/?]+)$/);
    if (detailMatch) return new Response(JSON.stringify(detailByKey[detailMatch[1]] ?? null), { status: 200 });
    return new Response(JSON.stringify({ error: `No stub for GET ${path}` }), { status: 500 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

function renderPage(initialPath = '/requests/mine') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <MyRequests />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const leaveRow = {
  id: 'r1',
  formKey: 'leave',
  formTitle: 'Leave Request',
  startDate: '2026-07-10',
  endDate: '2026-07-12',
  approversTotal: 2,
  approversDecided: 1,
  status: 'Pending Approval',
  createdAt: '2026-07-01T00:00:00.000Z',
};

test('renders the awaiting-approval count and a leave balance card', async () => {
  myRequestsBody = { rows: [leaveRow] };
  balancesBody = [{ leaveTypeId: 'lt1', leaveTypeName: 'Casual Leave', used: 3, total: 12 }];
  renderPage();
  assert.ok(await screen.findByText('Awaiting Approval'));
  assert.ok(screen.getByText('1'));
  assert.ok(await screen.findByText('Casual Leave'));
  assert.ok(screen.getByText('3/12'));
});

test('renders a request row with type, dates, approver progress, and status', async () => {
  myRequestsBody = { rows: [leaveRow] };
  renderPage();
  assert.ok(await screen.findByText('Leave Request'));
  assert.ok(screen.getByText('1/2 approved'));
  assert.ok(screen.getByText('Pending Approval'));
});

test('shows the empty state when there are no requests', async () => {
  renderPage();
  assert.ok(await screen.findByText('No requests yet'));
});

test('shows an error state with a working Retry on a load failure', async () => {
  myRequestsStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load your requests.'));
  myRequestsStatus = 200;
  myRequestsBody = { rows: [leaveRow] };
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.ok(await screen.findByText('Leave Request'));
});

test('clicking a row opens its detail drawer', async () => {
  myRequestsBody = { rows: [leaveRow] };
  detailByKey = { r1: minimalDetail('r1') };
  renderPage();
  await screen.findByText('Leave Request');

  fireEvent.click(screen.getByText('Leave Request'));
  const dialog = await screen.findByRole('dialog');
  assert.ok(dialog);
  assert.ok(requests.some((r) => r.path === '/requests/r1'));
});

test('a ?requestId= deep link opens the matching drawer once the list has loaded', async () => {
  myRequestsBody = { rows: [leaveRow] };
  detailByKey = { r1: minimalDetail('r1') };
  renderPage('/requests/mine?requestId=r1');
  await screen.findByText('Leave Request');

  assert.ok(await screen.findByRole('dialog'));
  assert.ok(requests.some((r) => r.path === '/requests/r1'));
});
