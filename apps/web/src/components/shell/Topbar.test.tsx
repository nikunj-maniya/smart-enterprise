import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NotificationDto } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import { Topbar } from './Topbar';

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

// No access token is ever stored in these tests: Topbar's NotificationsMenu wires up
// `onNewNotification`, which opens a real socket.io connection when a token is present —
// undesirable in a unit test. With no token, `getSocket()` short-circuits to a no-op, and
// nothing here depends on a signed-in `user` besides the '?' initials placeholder.
function stubNotifications(rows: NotificationDto[], unreadCount: number) {
  stubs.push({
    method: 'GET',
    path: '/notifications?pageSize=20',
    status: 200,
    body: { rows, total: rows.length, unreadCount, page: 1, pageSize: 20 },
  });
}

function renderTopbar() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Topbar />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const notif: NotificationDto = {
  id: 'n-1',
  type: 'enterprise_registered',
  payload: { registrationId: 'r-1', companyName: 'Acme Co' },
  read: false,
  createdAt: new Date().toISOString(),
};

test('clicking the search bar opens the search overlay', async () => {
  stubNotifications([], 0);
  renderTopbar();
  await screen.findByLabelText('Notifications');
  assert.equal(screen.queryByText('Esc'), null);
  fireEvent.click(screen.getByText('Search enterprises, users…'));
  assert.ok(screen.getByText('Esc'));
});

test('Cmd+K opens the search overlay from anywhere', async () => {
  stubNotifications([], 0);
  renderTopbar();
  await screen.findByLabelText('Notifications');
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
  assert.ok(screen.getByText('Esc'));
});

test('shows the unread count and the notification title once loaded', async () => {
  stubNotifications([notif], 1);
  renderTopbar();
  assert.ok(await screen.findByLabelText('Notifications, 1 unread'));
  fireEvent.click(screen.getByLabelText('Notifications, 1 unread'));
  assert.ok(screen.getByText('New enterprise registration — Acme Co'));
});

test('Mark all read clears the badge and posts to /notifications/read-all', async () => {
  stubNotifications([notif], 1);
  stubs.push({ method: 'POST', path: '/notifications/read-all', status: 200, body: {} });
  renderTopbar();
  await screen.findByLabelText('Notifications, 1 unread');
  fireEvent.click(screen.getByLabelText('Notifications, 1 unread'));
  fireEvent.click(screen.getByText('Mark all read'));
  assert.ok(screen.getByLabelText('Notifications'));
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/notifications/read-all'));
});

test('shows an empty state when there are no notifications', async () => {
  stubNotifications([], 0);
  renderTopbar();
  await screen.findByLabelText('Notifications');
  fireEvent.click(screen.getByLabelText('Notifications'));
  assert.ok(screen.getByText('You’re all caught up.'));
});
