import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import Holidays from './Holidays';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let listStatus = 200;
let listBody: { rows: unknown[] } = { rows: [] };
let createStatus = 201;
let createBody: unknown = { id: 'h-new', date: '2026-01-26', name: 'Republic Day' };
let deleteStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  listStatus = 200;
  listBody = { rows: [] };
  createStatus = 201;
  createBody = { id: 'h-new', date: '2026-01-26', name: 'Republic Day' };
  deleteStatus = 200;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path.startsWith('/holidays?year=')) {
      if (listStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load holidays.' }), { status: listStatus });
      return new Response(JSON.stringify(listBody), { status: 200 });
    }
    if (method === 'POST' && path === '/holidays') {
      if (createStatus !== 201) return new Response(JSON.stringify({ error: createBody }), { status: createStatus });
      return new Response(JSON.stringify(createBody), { status: 201 });
    }
    if (method === 'PUT' && path.startsWith('/holidays/')) {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: path.split('/')[2], ...body }), { status: 200 });
    }
    if (method === 'DELETE' && path.startsWith('/holidays/')) {
      if (deleteStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to delete the holiday.' }), { status: deleteStatus });
      return new Response(null, { status: 204 });
    }
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
      <Holidays />
    </AuthProvider>,
  );
}

// A fixed midweek date so `Weekend` never accidentally flags it regardless of run date.
const republicDay = { id: 'h1', date: '2026-01-26', name: 'Republic Day' };

test('renders holidays with a formatted date', async () => {
  listBody = { rows: [republicDay] };
  renderPage();
  assert.ok(await screen.findByText('Republic Day'));
  // Exact word order is locale-dependent — just confirm the day, month, and year all render.
  const dateText = screen.getByText(/Jan/).textContent;
  assert.match(dateText!, /26/);
  assert.match(dateText!, /2026/);
});

test('shows the empty state for a year with no holidays', async () => {
  renderPage();
  assert.ok(await screen.findByText(/No holidays configured for \d{4} yet\./));
});

test('changing the year refetches with the new year', async () => {
  renderPage();
  await screen.findByText(/No holidays configured/);
  const select = screen.getByLabelText('Year') as HTMLSelectElement;
  const nextYear = String(Number(select.value) + 1);
  fireEvent.change(select, { target: { value: nextYear } });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(requests.some((r) => r.path === `/holidays?year=${nextYear}`));
});

test('shows an error state with a working Retry button on a list failure', async () => {
  listStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load holidays.'));
  listStatus = 200;
  listBody = { rows: [republicDay] };
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.ok(await screen.findByText('Republic Day'));
});

test('Add holiday requires a date and a name, then creates and toasts', async () => {
  renderPage();
  await screen.findByText(/No holidays configured/);

  fireEvent.click(screen.getByRole('button', { name: /Add holiday/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  assert.ok(await within(dialog).findByText('Date is required.'));

  fireEvent.change(within(dialog).getByLabelText(/^Date/), { target: { value: '2026-01-26' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  assert.ok(await within(dialog).findByText('Holiday name is required.'));

  fireEvent.change(within(dialog).getByLabelText('Holiday name'), { target: { value: 'Republic Day' } });
  listBody = { rows: [republicDay] };
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  assert.ok(await screen.findByText('Holiday added'));
  const post = requests.find((r) => r.method === 'POST' && r.path === '/holidays');
  assert.deepEqual(post?.body, { date: '2026-01-26', name: 'Republic Day' });
});

test('a duplicate-date 409 shows the error next to the date field, not in the footer', async () => {
  createStatus = 409;
  createBody = 'A holiday already exists on this date.';
  renderPage();
  await screen.findByText(/No holidays configured/);

  fireEvent.click(screen.getByRole('button', { name: /Add holiday/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/^Date/), { target: { value: '2026-01-26' } });
  fireEvent.change(within(dialog).getByLabelText('Holiday name'), { target: { value: 'Republic Day' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  const dateError = await within(dialog).findByText('A holiday already exists on this date.');
  assert.ok(dateError.closest('label')?.textContent?.startsWith('Date'));
});

test('Edit prefills the holiday and updates it via PUT', async () => {
  listBody = { rows: [republicDay] };
  renderPage();
  await screen.findByText('Republic Day');

  fireEvent.click(screen.getByRole('button', { name: 'Edit Republic Day' }));
  const dialog = screen.getByRole('dialog');
  assert.equal((within(dialog).getByLabelText('Holiday name') as HTMLInputElement).value, 'Republic Day');

  fireEvent.change(within(dialog).getByLabelText('Holiday name'), { target: { value: 'Republic Day (renamed)' } });
  listBody = { rows: [{ ...republicDay, name: 'Republic Day (renamed)' }] };
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  assert.ok(await screen.findByText('Holiday updated'));
  assert.ok(requests.some((r) => r.method === 'PUT' && r.path === '/holidays/h1'));
});

test('deleting a holiday confirms, deletes, and toasts', async () => {
  listBody = { rows: [republicDay] };
  renderPage();
  await screen.findByText('Republic Day');

  listBody = { rows: [] };
  fireEvent.click(screen.getByRole('button', { name: 'Delete Republic Day' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete holiday' }));

  assert.ok(await screen.findByText('Holiday deleted'));
  assert.ok(requests.some((r) => r.method === 'DELETE' && r.path === '/holidays/h1'));
});

test('a failed delete surfaces the error and keeps the dialog open', async () => {
  listBody = { rows: [republicDay] };
  deleteStatus = 400;
  renderPage();
  await screen.findByText('Republic Day');

  fireEvent.click(screen.getByRole('button', { name: 'Delete Republic Day' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete holiday' }));

  assert.ok(await screen.findByText('Unable to delete the holiday.'));
  assert.ok(screen.getByRole('dialog'));
});
