import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { AppShell } from './AppShell';

interface Stub {
  method: string;
  path: string;
  status: number;
  body?: unknown;
}

let stubs: Stub[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  stubs = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
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

// No token is set (no signed-in user), which keeps this to a structural smoke test: the
// Topbar's notification poll still runs unconditionally, so it needs a stub regardless.
function renderShell(initialPath: string) {
  stubs.push({
    method: 'GET',
    path: '/notifications?pageSize=20',
    status: 200,
    body: { rows: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 },
  });
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/requests" element={<div>Requests page content</div>} />
            <Route path="/audit" element={<div>Audit log content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('renders the sidebar, topbar, and the routed outlet content', async () => {
  renderShell('/requests');
  assert.ok(screen.getByText(/Smart/));
  assert.ok(screen.getByText('Search enterprises, users…'));
  assert.ok(screen.getByText('Requests page content'));
});

test('renders whichever page the current route maps to', async () => {
  renderShell('/audit');
  assert.ok(screen.getByText('Audit log content'));
  assert.equal(screen.queryByText('Requests page content'), null);
});
