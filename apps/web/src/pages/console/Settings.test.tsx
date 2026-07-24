import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import Settings from './Settings';

interface Recorded {
  method: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let settingsBody: Record<string, boolean> = {
  forcePasswordChangeOnFirstLogin: true,
  allowPublicRegistration: false,
  notifyOnNewRegistration: true,
};
let putStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  putStatus = 200;
  settingsBody = {
    forcePasswordChangeOnFirstLogin: true,
    allowPublicRegistration: false,
    notifyOnNewRegistration: true,
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path === '/settings') {
      return new Response(JSON.stringify(settingsBody), { status: 200 });
    }
    if (method === 'PUT' && path === '/settings') {
      if (putStatus !== 200) {
        return new Response(JSON.stringify({ error: 'Unable to update settings.' }), { status: putStatus });
      }
      return new Response(JSON.stringify(settingsBody), { status: 200 });
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
      <Settings />
    </AuthProvider>,
  );
}

test('renders the 3 toggles reflecting the fetched settings', async () => {
  renderPage();
  const switches = await screen.findAllByRole('switch');
  assert.equal(switches.length, 3);
  assert.equal(switches[0].getAttribute('aria-checked'), 'true');
  assert.equal(switches[1].getAttribute('aria-checked'), 'false');
  assert.equal(switches[2].getAttribute('aria-checked'), 'true');
});

test('toggling a switch flips it optimistically and PUTs the change', async () => {
  renderPage();
  const switches = await screen.findAllByRole('switch');
  fireEvent.click(switches[1]);

  assert.equal(screen.getAllByRole('switch')[1].getAttribute('aria-checked'), 'true');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const put = requests.find((r) => r.method === 'PUT');
  assert.ok(put);
  assert.deepEqual(put.body, { allowPublicRegistration: true });
});

test('a failed update reverts the toggle and shows the error', async () => {
  putStatus = 400;
  renderPage();
  const switches = await screen.findAllByRole('switch');
  fireEvent.click(switches[1]);

  assert.ok(await screen.findByText('Unable to update settings.'));
  assert.equal(screen.getAllByRole('switch')[1].getAttribute('aria-checked'), 'false');
});
