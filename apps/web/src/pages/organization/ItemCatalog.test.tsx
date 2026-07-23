import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import ItemCatalog from './ItemCatalog';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let itemsBody: unknown[] = [];
let listStatus = 200;
let createStatus = 201;
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  itemsBody = [];
  listStatus = 200;
  createStatus = 201;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path === '/item-catalog') {
      if (listStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load the item catalog.' }), { status: listStatus });
      return new Response(JSON.stringify(itemsBody), { status: 200 });
    }
    if (method === 'POST' && path === '/item-catalog') {
      const body = JSON.parse(String(init?.body));
      if (createStatus !== 201) return new Response(JSON.stringify({ error: 'Unable to add this item.' }), { status: createStatus });
      return new Response(JSON.stringify({ id: 'i-new', type: body.type, name: body.name, archived: false, referenced: false }), { status: 201 });
    }
    if (method === 'PUT' && path.startsWith('/item-catalog/')) {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: path.split('/')[2], type: 'software', name: 'Laptop', referenced: false, ...body }), { status: 200 });
    }
    if (method === 'DELETE' && path.startsWith('/item-catalog/')) {
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
      <ItemCatalog />
    </AuthProvider>,
  );
}

const laptop = { id: 'i1', type: 'software', name: 'Laptop', archived: false, referenced: false };

test('renders items for the active tab (Software by default)', async () => {
  itemsBody = [laptop];
  renderPage();
  assert.ok(await screen.findByText('Laptop'));
  assert.ok(screen.getByText('Active'));
});

test('shows an empty state per tab, and switching to Hardware refilters without refetching', async () => {
  itemsBody = [laptop];
  renderPage();
  await screen.findByText('Laptop');

  fireEvent.click(screen.getByRole('button', { name: 'Hardware' }));
  assert.ok(await screen.findByText('No hardware items yet'));
  assert.equal(requests.filter((r) => r.method === 'GET' && r.path === '/item-catalog').length, 1);
});

test('adding an item posts to the catalog and clears the input on success', async () => {
  renderPage();
  await screen.findByText('No software items yet');

  const input = screen.getByPlaceholderText('New software item name') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'Laptop' } });
  fireEvent.click(screen.getByRole('button', { name: /Add/ }));

  assert.ok(await screen.findByText('Item added.'));
  assert.equal(input.value, '');
  const post = requests.find((r) => r.method === 'POST');
  assert.deepEqual(post?.body, { type: 'software', name: 'Laptop' });
});

test('pressing Enter in the input also adds the item', async () => {
  renderPage();
  await screen.findByText('No software items yet');
  const input = screen.getByPlaceholderText('New software item name');
  fireEvent.change(input, { target: { value: 'Mouse' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  assert.ok(await screen.findByText('Item added.'));
});

test('a failed add surfaces the error next to the input', async () => {
  createStatus = 400;
  renderPage();
  await screen.findByText('No software items yet');
  fireEvent.change(screen.getByPlaceholderText('New software item name'), { target: { value: 'Laptop' } });
  fireEvent.click(screen.getByRole('button', { name: /Add/ }));
  assert.ok(await screen.findByText('Unable to add this item.'));
});

test('archiving toggles the badge and shows a toast', async () => {
  itemsBody = [laptop];
  renderPage();
  await screen.findByText('Laptop');
  fireEvent.click(screen.getByRole('button', { name: 'Archive Laptop' }));
  assert.ok(await screen.findByText('Item archived.'));
  assert.ok(screen.getByText('Archived'));
});

test('deleting an item removes it from the list and shows a toast', async () => {
  itemsBody = [laptop];
  renderPage();
  await screen.findByText('Laptop');
  fireEvent.click(screen.getByRole('button', { name: 'Delete Laptop' }));
  assert.ok(await screen.findByText('Item deleted.'));
  assert.equal(screen.queryByText('Laptop'), null);
});

test('a list-load failure shows the error message', async () => {
  listStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load the item catalog.'));
});
