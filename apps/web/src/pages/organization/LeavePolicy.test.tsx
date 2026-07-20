import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { LeaveTypeDto } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import LeavePolicy from './LeavePolicy';

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

const casual: LeaveTypeDto = {
  id: 'lt-1',
  name: 'Casual Leave',
  quota: 12,
  isPaid: true,
  carryForward: false,
  halfDayAllowed: true,
};
const lwp: LeaveTypeDto = {
  id: 'lt-2',
  name: 'Leave Without Pay',
  quota: 0,
  isPaid: false,
  carryForward: false,
  halfDayAllowed: false,
};

function stubBase(rows: LeaveTypeDto[] = [casual, lwp]) {
  stubs.push(
    { method: 'GET', path: '/leave-types', status: 200, body: rows },
    { method: 'GET', path: '/leave-types/absence-cap', status: 200, body: { cap: 3 } },
  );
}

function renderPage() {
  return render(
    <AuthProvider>
      <LeavePolicy />
    </AuthProvider>,
  );
}

test('lists the configured leave types', async () => {
  stubBase();
  renderPage();
  assert.ok(await screen.findByText('Casual Leave'));
  assert.ok(screen.getByText('Leave Without Pay'));
});

test('Add leave type opens the create dialog and posts the new type', async () => {
  stubBase();
  stubs.push({
    method: 'POST',
    path: '/leave-types',
    status: 201,
    body: { ...casual, id: 'lt-3', name: 'Paternity Leave', quota: 10 },
  });
  renderPage();
  await screen.findByText('Casual Leave');

  fireEvent.click(screen.getByRole('button', { name: /Add leave type/ }));
  const dialog = screen.getByRole('dialog');
  assert.ok(within(dialog).getByText('New leave type'));

  fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Paternity Leave' } });
  fireEvent.change(within(dialog).getByLabelText(/Annual quota/), { target: { value: '10' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Create leave type/ }));

  assert.ok(await screen.findByText('Paternity Leave created'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/leave-types');
  assert.ok(post);
  assert.deepEqual(post.body, {
    name: 'Paternity Leave',
    quota: 10,
    isPaid: true,
    carryForward: false,
    halfDayAllowed: false,
  });
});

test('create dialog surfaces a duplicate-name 409 next to the name field', async () => {
  stubBase();
  stubs.push({
    method: 'POST',
    path: '/leave-types',
    status: 409,
    body: { error: 'A leave type named "Casual Leave" already exists.' },
  });
  renderPage();
  await screen.findByText('Casual Leave');

  fireEvent.click(screen.getByRole('button', { name: /Add leave type/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Casual Leave' } });
  fireEvent.change(within(dialog).getByLabelText(/Annual quota/), { target: { value: '5' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Create leave type/ }));

  assert.ok(await within(dialog).findByText('A leave type named "Casual Leave" already exists.'));
});

test('pencil opens the edit dialog prefilled and saves name/isPaid changes', async () => {
  stubBase();
  stubs.push({
    method: 'PUT',
    path: '/leave-types/lt-1',
    status: 200,
    body: { ...casual, name: 'Casual', isPaid: false },
  });
  renderPage();
  await screen.findByText('Casual Leave');

  fireEvent.click(screen.getByRole('button', { name: 'Edit Casual Leave' }));
  const dialog = screen.getByRole('dialog');
  assert.ok(within(dialog).getByText('Edit leave type'));
  const nameInput = within(dialog).getByLabelText(/^Name/) as HTMLInputElement;
  assert.equal(nameInput.value, 'Casual Leave');

  fireEvent.change(nameInput, { target: { value: 'Casual' } });
  // First switch in the dialog is the Paid toggle — flip paid → unpaid.
  fireEvent.click(within(dialog).getAllByRole('switch')[0]);
  fireEvent.click(within(dialog).getByRole('button', { name: /Save changes/ }));

  assert.ok(await screen.findByText('Casual updated'));
  const put = requests.find((r) => r.method === 'PUT' && r.path === '/leave-types/lt-1');
  assert.ok(put);
  assert.deepEqual(put.body, {
    name: 'Casual',
    quota: 12,
    isPaid: false,
    carryForward: false,
    halfDayAllowed: true,
  });
});

test('deleting an unused type confirms, deletes, and toasts past tense', async () => {
  stubBase();
  stubs.push({ method: 'DELETE', path: '/leave-types/lt-1', status: 204 });
  renderPage();
  await screen.findByText('Casual Leave');

  fireEvent.click(screen.getByRole('button', { name: 'Delete Casual Leave' }));
  const dialog = screen.getByRole('dialog');
  assert.ok(within(dialog).getByText('Casual Leave', { selector: 'strong' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete leave type' }));

  assert.ok(await screen.findByText('Casual Leave deleted'));
  assert.ok(requests.some((r) => r.method === 'DELETE' && r.path === '/leave-types/lt-1'));
});

test('a 409 on delete marks the row blocked with the reason and skips the confirm on re-click', async () => {
  const reason = 'In use: 2 requests reference this leave type.';
  stubBase();
  stubs.push({ method: 'DELETE', path: '/leave-types/lt-1', status: 409, body: { error: reason } });
  renderPage();
  await screen.findByText('Casual Leave');

  fireEvent.click(screen.getByRole('button', { name: 'Delete Casual Leave' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete leave type' }));

  // Confirm closed, reason toasted, and the row button now carries the blocked state.
  assert.ok(await screen.findByText(reason));
  assert.equal(screen.queryByRole('dialog'), null);
  const deleteButton = screen.getByRole('button', { name: 'Delete Casual Leave' });
  assert.equal(deleteButton.getAttribute('title'), reason);
  assert.equal(deleteButton.getAttribute('aria-disabled'), 'true');

  // Clicking a blocked delete only resurfaces the reason — no confirm dialog.
  fireEvent.click(deleteButton);
  assert.equal(screen.queryByRole('dialog'), null);
  assert.ok(screen.getByText(reason));
});
