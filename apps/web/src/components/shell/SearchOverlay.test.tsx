import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { SearchResultItem } from '@se/shared';
import { SearchOverlay } from './SearchOverlay';

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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderOverlay(open: boolean, onClose: () => void) {
  return render(
    <MemoryRouter initialEntries={['/start']}>
      <SearchOverlay open={open} onClose={onClose} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const requestItem: SearchResultItem = { type: 'request', id: 'req-1', title: 'WiFi request', subtitle: 'Pending' };
const userItem: SearchResultItem = { type: 'user', id: 'user-1', title: 'Jane Doe', subtitle: 'jane@acme.com' };

function stubSearch(q: string, groups: { type: SearchResultItem['type']; label: string; items: SearchResultItem[] }[]) {
  stubs.push({ method: 'GET', path: `/search?q=${q}`, status: 200, body: { groups } });
}

test('renders nothing when closed', () => {
  const { container } = renderOverlay(false, () => {});
  assert.equal(container.querySelector('input'), null);
});

test('shows the "start typing" hint below the minimum query length', () => {
  renderOverlay(true, () => {});
  assert.ok(screen.getByText('Start typing to search across enterprises, users…'));
  fireEvent.change(screen.getByPlaceholderText('Search enterprises, users…'), { target: { value: 'a' } });
  assert.ok(screen.getByText('Start typing to search across enterprises, users…'));
});

test('debounces the query and renders grouped results', async () => {
  stubSearch('wifi', [
    { type: 'request', label: 'Requests', items: [requestItem] },
    { type: 'user', label: 'Users', items: [userItem] },
  ]);
  renderOverlay(true, () => {});
  fireEvent.change(screen.getByPlaceholderText('Search enterprises, users…'), { target: { value: 'wifi' } });
  assert.ok(await screen.findByText('WiFi request'));
  assert.ok(screen.getByText('Requests'));
  assert.ok(screen.getByText('Jane Doe'));
  assert.ok(screen.getByText('Users'));
});

test('shows a no-matches state when the search returns no groups', async () => {
  stubSearch('zzz', []);
  renderOverlay(true, () => {});
  fireEvent.change(screen.getByPlaceholderText('Search enterprises, users…'), { target: { value: 'zzz' } });
  assert.ok(await screen.findByText('No matches found.'));
});

test('the Esc badge closes the overlay', () => {
  let closed = false;
  renderOverlay(true, () => (closed = true));
  fireEvent.click(screen.getByText('Esc'));
  assert.equal(closed, true);
});

test('clicking the scrim closes the overlay, clicking the card does not', () => {
  let closeCount = 0;
  const { container } = renderOverlay(true, () => (closeCount += 1));
  fireEvent.click(screen.getByPlaceholderText('Search enterprises, users…'));
  assert.equal(closeCount, 0);
  fireEvent.click(container.firstElementChild as Element);
  assert.equal(closeCount, 1);
});

test('clicking a result closes the overlay and navigates to its detail route', async () => {
  stubSearch('wifi', [{ type: 'request', label: 'Requests', items: [requestItem] }]);
  let closed = false;
  renderOverlay(true, () => (closed = true));
  fireEvent.change(screen.getByPlaceholderText('Search enterprises, users…'), { target: { value: 'wifi' } });
  fireEvent.click(await screen.findByText('WiFi request'));
  assert.equal(closed, true);
  assert.equal(screen.getByTestId('location').textContent, '/requests?requestId=req-1');
});

test('ArrowDown then Enter selects the second result', async () => {
  stubSearch('wifi', [
    { type: 'request', label: 'Requests', items: [requestItem] },
    { type: 'user', label: 'Users', items: [userItem] },
  ]);
  renderOverlay(true, () => {});
  fireEvent.change(screen.getByPlaceholderText('Search enterprises, users…'), { target: { value: 'wifi' } });
  await screen.findByText('Jane Doe');
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  fireEvent.keyDown(window, { key: 'Enter' });
  assert.equal(screen.getByTestId('location').textContent, '/organization/users?highlight=user-1');
});
