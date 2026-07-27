import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Join from './Join';

interface Stub {
  method: string;
  path: string;
  status: number;
  body?: unknown;
}

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
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
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
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

function renderPage(token = 'tok-1') {
  return render(
    <MemoryRouter initialEntries={[`/join/${token}`]}>
      <Routes>
        <Route path="/join/:token" element={<Join />} />
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function stubInfo(tenantName = 'Acme Corp') {
  stubs.push({ method: 'GET', path: '/public/self-registration/tok-1', status: 200, body: { tenantName } });
}

test('shows a loading state before the invite info resolves', () => {
  stubInfo();
  renderPage();
  assert.ok(screen.getByText('Loading…'));
});

test('loads the tenant name and shows the join form', async () => {
  stubInfo('Acme Corp');
  renderPage();
  assert.ok(await screen.findByText('Join Acme Corp'));
});

test('shows link-unavailable when the token is invalid or expired', async () => {
  stubs.push({
    method: 'GET',
    path: '/public/self-registration/tok-1',
    status: 410,
    body: { error: 'This registration link has expired.' },
  });
  renderPage();

  assert.ok(await screen.findByText('Link unavailable'));
  assert.ok(screen.getByText('This registration link has expired.'));
});

test('requires a name, email, and 8+ character password before submitting', async () => {
  stubInfo();
  renderPage();
  await screen.findByText('Join Acme Corp');

  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  assert.ok(await screen.findByText('Name is required.'));

  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New Hire' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  assert.ok(await screen.findByText('Email is required.'));

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'newhire@acme.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  assert.ok(await screen.findByText('Password must be at least 8 characters.'));

  assert.equal(requests.some((r) => r.method === 'POST'), false);
});

test('submits the registration request and shows the pending-review confirmation', async () => {
  stubInfo('Acme Corp');
  stubs.push({ method: 'POST', path: '/public/self-registration/tok-1', status: 201, body: {} });
  renderPage();
  await screen.findByText('Join Acme Corp');

  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New Hire' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'newhire@acme.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

  assert.ok(await screen.findByText('Request submitted'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/public/self-registration/tok-1');
  assert.ok(post);
  assert.deepEqual(post.body, { name: 'New Hire', email: 'newhire@acme.com', password: 'password1' });
});

test('surfaces a server error from the API', async () => {
  stubInfo();
  stubs.push({
    method: 'POST',
    path: '/public/self-registration/tok-1',
    status: 400,
    body: { error: 'Something went wrong.' },
  });
  renderPage();
  await screen.findByText('Join Acme Corp');

  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New Hire' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'newhire@acme.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

  assert.ok(await screen.findByText('Something went wrong.'));
});
