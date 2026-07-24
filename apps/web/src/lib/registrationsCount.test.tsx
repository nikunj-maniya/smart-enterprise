import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { tokenStore } from '@/lib/api';
import { RegistrationsCountProvider, useRegistrationsCount } from './registrationsCount';

interface Stub {
  method: string;
  path: string;
  status: number;
  body?: unknown;
}

let stubs: Stub[] = [];
let requests: { method: string; path: string }[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  stubs = [];
  requests = [];
  tokenStore.clear();
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
  tokenStore.clear();
  cleanup();
});

function Consumer() {
  const { pendingCount, refresh } = useRegistrationsCount();
  return (
    <div>
      <span data-testid="count">{pendingCount}</span>
      <button onClick={refresh}>refresh</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <RegistrationsCountProvider>
        <Consumer />
      </RegistrationsCountProvider>
    </AuthProvider>,
  );
}

test('fetches the pending count on mount for a system admin', async () => {
  tokenStore.set('at-1', 'rt-1');
  stubs.push(
    {
      method: 'GET',
      path: '/auth/me',
      status: 200,
      body: {
        id: 'u-1',
        name: 'Sam Admin',
        email: 'sam@example.com',
        isSystemAdmin: true,
        mustChangePassword: false,
        tenantId: null,
        tenantName: null,
        roles: [],
      },
    },
    { method: 'GET', path: '/registrations?status=Pending&pageSize=1', status: 200, body: { rows: [], total: 5, page: 1, pageSize: 1 } },
  );
  renderProvider();
  assert.ok(await screen.findByText('5'));
});

test('never calls the registrations endpoint for a non-system-admin user', async () => {
  tokenStore.set('at-1', 'rt-1');
  stubs.push({
    method: 'GET',
    path: '/auth/me',
    status: 200,
    body: {
      id: 'u-2',
      name: 'Employee',
      email: 'emp@example.com',
      isSystemAdmin: false,
      mustChangePassword: false,
      tenantId: 't-1',
      tenantName: 'Acme',
      roles: ['employee'],
    },
  });
  renderProvider();
  assert.equal((await screen.findByTestId('count')).textContent, '0');
  assert.equal(requests.some((r) => r.path.startsWith('/registrations')), false);
});

test('defaults to a pendingCount of 0 with no signed-in user', async () => {
  renderProvider();
  assert.equal((await screen.findByTestId('count')).textContent, '0');
});

test('refresh() re-fetches and updates the pending count', async () => {
  tokenStore.set('at-1', 'rt-1');
  stubs.push(
    {
      method: 'GET',
      path: '/auth/me',
      status: 200,
      body: {
        id: 'u-1',
        name: 'Sam Admin',
        email: 'sam@example.com',
        isSystemAdmin: true,
        mustChangePassword: false,
        tenantId: null,
        tenantName: null,
        roles: [],
      },
    },
    { method: 'GET', path: '/registrations?status=Pending&pageSize=1', status: 200, body: { rows: [], total: 2, page: 1, pageSize: 1 } },
  );
  renderProvider();
  assert.ok(await screen.findByText('2'));

  const stub = stubs.find((s) => s.method === 'GET' && s.path === '/registrations?status=Pending&pageSize=1');
  assert.ok(stub);
  stub.body = { rows: [], total: 9, page: 1, pageSize: 1 };
  screen.getByRole('button', { name: 'refresh' }).click();
  await screen.findByText('9');
});

test('useRegistrationsCount throws when called outside its provider', () => {
  function Broken() {
    useRegistrationsCount();
    return null;
  }
  assert.throws(() => render(<Broken />), /useRegistrationsCount must be used within RegistrationsCountProvider/);
});
