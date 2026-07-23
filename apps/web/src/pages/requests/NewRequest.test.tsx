import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import NewRequest from './NewRequest';

let formsStatus = 200;
let formsBody: unknown = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  formsStatus = 200;
  formsBody = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = String(input).replace('http://localhost:4000', '');
    if (path === '/forms') {
      if (formsStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load request forms.' }), { status: formsStatus });
      return new Response(JSON.stringify(formsBody), { status: 200 });
    }
    return new Response(JSON.stringify({ error: `No stub for GET ${path}` }), { status: 500 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <NewRequest />
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('renders a card per published form linking to /requests/new/:key', async () => {
  formsBody = [{ key: 'leave', title: 'Leave Request' }, { key: 'wfh', title: 'Work From Home' }];
  renderPage();
  assert.ok(await screen.findByText('Leave Request'));
  assert.ok(screen.getByText('Work From Home'));
  const link = screen.getByRole('link', { name: /Leave Request/ });
  assert.equal(link.getAttribute('href'), '/requests/new/leave');
});

test('shows the empty state when no forms are published', async () => {
  renderPage();
  assert.ok(await screen.findByText('No request forms are available yet.'));
});

test('shows an error message when the forms fail to load', async () => {
  formsStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load request forms.'));
});
