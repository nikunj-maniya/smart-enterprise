import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NotificationDto } from '@se/shared';
import Notifications from './Notifications';

interface Stub {
  method: string;
  path: string;
  status: number;
  body?: unknown;
}

interface Recorded {
  method: string;
  path: string;
}

let stubs: Stub[] = [];
let requests: Recorded[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  stubs = [];
  requests = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path });
    const stub = stubs.find((s) => s.method === method && s.path === path);
    if (!stub) {
      return new Response(JSON.stringify({ error: `No stub for ${method} ${path}` }), { status: 500 });
    }
    return new Response(stub.status === 204 ? null : JSON.stringify(stub.body), { status: stub.status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

// No access token is stored in any of these tests, so `onNewNotification`'s socket connection
// short-circuits to a no-op (see socket.test.ts) — nothing here depends on a live push.

const approvalNotif: NotificationDto = {
  id: 'n-1',
  type: 'request_needs_approval',
  payload: { requestId: 'r-1', requesterName: 'Ada Lovelace', formTitle: 'Leave', formKey: 'leave' },
  read: false,
  createdAt: new Date().toISOString(),
};

const approvedNotif: NotificationDto = {
  id: 'n-2',
  type: 'request_approved',
  payload: { requestId: 'r-2', approverName: 'Grace Hopper', formTitle: 'WFH' },
  read: true,
  createdAt: new Date().toISOString(),
};

function stubList(tab: 'all' | 'unread', rows: NotificationDto[], unreadCount: number) {
  stubs.push({
    method: 'GET',
    path: `/notifications?tab=${tab}&pageSize=50`,
    status: 200,
    body: { rows, total: rows.length, unreadCount, page: 1, pageSize: 50 },
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Notifications />
    </MemoryRouter>,
  );
}

test('lists notifications on the default All tab', async () => {
  stubList('all', [approvalNotif, approvedNotif], 1);
  renderPage();

  assert.ok(await screen.findByText('New Leave request from Ada Lovelace needs your approval'));
  assert.ok(screen.getByText('Grace Hopper approved your WFH request'));
  assert.ok(screen.getByText('Unread · 1'));
});

test('shows an empty state when there are no notifications', async () => {
  stubList('all', [], 0);
  renderPage();

  assert.ok(await screen.findByText('You’re all caught up'));
  assert.ok(screen.getByText('No notifications yet.'));
});

test('switching to the Unread tab re-fetches with tab=unread', async () => {
  stubList('all', [approvalNotif, approvedNotif], 1);
  stubList('unread', [approvalNotif], 1);
  renderPage();
  await screen.findByText('New Leave request from Ada Lovelace needs your approval');

  fireEvent.click(screen.getByText('Unread · 1'));

  assert.ok(requests.some((r) => r.path === '/notifications?tab=unread&pageSize=50'));
  await screen.findByText('New Leave request from Ada Lovelace needs your approval');
  assert.equal(screen.queryByText('Grace Hopper approved your WFH request'), null);
});

test('shows an error when the list fails to load', async () => {
  stubs.push({
    method: 'GET',
    path: '/notifications?tab=all&pageSize=50',
    status: 500,
    body: { error: 'Unable to load notifications.' },
  });
  renderPage();

  assert.ok(await screen.findByText('Unable to load notifications.'));
});

test('Mark all read clears the unread count and posts to /notifications/read-all', async () => {
  stubList('all', [approvalNotif, approvedNotif], 1);
  stubs.push({ method: 'POST', path: '/notifications/read-all', status: 200, body: {} });
  renderPage();
  await screen.findByText('Unread · 1');

  fireEvent.click(screen.getByRole('button', { name: /Mark all read/ }));

  assert.ok(await screen.findByText('Unread · 0'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/notifications/read-all'));
});

test('Mark all read is disabled when there is nothing unread', async () => {
  stubList('all', [approvedNotif], 0);
  renderPage();
  await screen.findByText('Grace Hopper approved your WFH request');

  assert.equal(screen.getByRole('button', { name: /Mark all read/ }).hasAttribute('disabled'), true);
});

test('selecting an unread notification marks it read and navigates to its target', async () => {
  stubList('all', [approvalNotif], 1);
  stubs.push({ method: 'POST', path: '/notifications/n-1/read', status: 200, body: {} });
  renderPage();
  const item = await screen.findByText('New Leave request from Ada Lovelace needs your approval');

  fireEvent.click(item);

  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/notifications/n-1/read'));
});
