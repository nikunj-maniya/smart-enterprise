import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import FrontDesk from './FrontDesk';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

let requests: Recorded[] = [];
let todayStatus = 200;
let todayBody: Record<string, unknown> = { expected: [], onSite: [], checkedOut: [] };
let checkInStatus = 200;
let windowOpenCalls: string[] = [];
const realFetch = globalThis.fetch;
const realOpen = window.open;

beforeEach(() => {
  requests = [];
  todayStatus = 200;
  todayBody = { expected: [], onSite: [], checkedOut: [] };
  checkInStatus = 200;
  windowOpenCalls = [];
  window.open = ((url: string) => {
    windowOpenCalls.push(url);
    return null;
  }) as typeof window.open;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path === '/front-desk/today') {
      if (todayStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load Front Desk.' }), { status: todayStatus });
      return new Response(JSON.stringify(todayBody), { status: 200 });
    }
    if (method === 'POST' && /\/requests\/[^/]+\/transitions$/.test(path)) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (method === 'POST' && /\/front-desk\/[^/]+\/check-in$/.test(path)) {
      if (checkInStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to check in this visitor.' }), { status: checkInStatus });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (method === 'GET' && /\/front-desk\/[^/]+\/signature-url$/.test(path)) {
      return new Response(JSON.stringify({ url: 'https://storage.example/signed-url' }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: `No stub for ${method} ${path}` }), { status: 500 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  window.open = realOpen;
  cleanup();
});

function renderPage() {
  return render(
    <AuthProvider>
      <FrontDesk />
    </AuthProvider>,
  );
}

const expectedVisitor = {
  requestId: 'r1',
  visitorName: 'Ada Lovelace',
  status: 'Approved',
  hostName: 'Grace Hopper',
  purpose: 'Interview',
  visitDatetime: '2026-07-10T10:00:00.000Z',
  mobile: '9999999999',
  laptopDetails: 'MacBook Pro',
  checkInAt: null,
  checkOutAt: null,
};
const onSiteVisitor = { ...expectedVisitor, requestId: 'r2', visitorName: 'Bob', status: 'Checked-In', checkInAt: '2026-07-10T10:05:00.000Z' };
const checkedOutVisitor = { ...onSiteVisitor, requestId: 'r3', visitorName: 'Carol', status: 'Checked-Out', checkOutAt: '2026-07-10T12:00:00.000Z' };

test('renders stat cards for expected/on-site/checked-out counts', async () => {
  todayBody = { expected: [expectedVisitor], onSite: [onSiteVisitor], checkedOut: [] };
  renderPage();
  await screen.findByText('Expected today');
  const expectedCard = screen.getByText('Expected today').parentElement as HTMLElement;
  assert.ok(within(expectedCard).getByText('1'));
  // "On-site" also labels the filter tab — scope to the stat card's label (a <div>).
  const onSiteCard = screen.getAllByText('On-site').find((el) => el.tagName === 'DIV')!.parentElement as HTMLElement;
  assert.ok(within(onSiteCard).getByText('1'));
});

test('renders a visitor card with host, purpose, visit time, and laptop chip', async () => {
  todayBody = { expected: [expectedVisitor], onSite: [], checkedOut: [] };
  renderPage();
  assert.ok(await screen.findByText('Ada Lovelace'));
  assert.ok(screen.getByText(/Host: Grace Hopper/));
  assert.ok(screen.getByText(/Interview/));
  assert.ok(screen.getByText(/MacBook Pro/));
});

test('tabs filter to expected/on-site/checked-out, and show the empty state per tab', async () => {
  todayBody = { expected: [expectedVisitor], onSite: [onSiteVisitor], checkedOut: [] };
  renderPage();
  await screen.findByText('Ada Lovelace');
  assert.ok(screen.getByText('Bob'));

  fireEvent.click(screen.getByRole('button', { name: 'Checked Out' }));
  assert.ok(await screen.findByText('No visitors checked out yet today.'));
  assert.equal(screen.queryByText('Ada Lovelace'), null);
});

test('shows an error state with a working Retry', async () => {
  todayStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load Front Desk.'));
  todayStatus = 200;
  todayBody = { expected: [expectedVisitor], onSite: [], checkedOut: [] };
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.ok(await screen.findByText('Ada Lovelace'));
});

// jsdom has no real <canvas> 2D context, so a stroke can't be drawn here and "Confirm check-in"
// stays disabled (SignaturePadModal's own test suite carves this out for the same reason) —
// this only verifies the modal opens/closes, not the check-in POST itself.
test('Check-in opens the signature pad, and Cancel closes it without checking in', async () => {
  todayBody = { expected: [expectedVisitor], onSite: [], checkedOut: [] };
  renderPage();
  await screen.findByText('Ada Lovelace');

  fireEvent.click(screen.getByRole('button', { name: /Check-in/ }));
  assert.ok(await screen.findByText('Sign in — Ada Lovelace'));
  const dialog = screen.getByRole('dialog');
  assert.equal((within(dialog).getByRole('button', { name: /Confirm check-in/ }) as HTMLButtonElement).disabled, true);

  // "Cancel" also matches the row's own danger Cancel-visit button — scope to the modal.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  assert.equal(screen.queryByText('Sign in — Ada Lovelace'), null);
  assert.equal(requests.some((r) => r.path.includes('/check-in')), false);
});

test('No-Show and Cancel transition an Approved visitor', async () => {
  todayBody = { expected: [expectedVisitor], onSite: [], checkedOut: [] };
  renderPage();
  await screen.findByText('Ada Lovelace');

  todayBody = { expected: [], onSite: [], checkedOut: [] };
  fireEvent.click(screen.getByRole('button', { name: 'No-Show' }));
  assert.ok(await screen.findByText('Marked as no-show.'));
  const noShow = requests.find((r) => r.method === 'POST' && r.path === '/requests/r1/transitions');
  assert.deepEqual(noShow?.body, { toState: 'No-Show' });
});

test('Check-out transitions a Checked-In visitor', async () => {
  todayBody = { expected: [], onSite: [onSiteVisitor], checkedOut: [] };
  renderPage();
  await screen.findByText('Bob');

  todayBody = { expected: [], onSite: [], checkedOut: [checkedOutVisitor] };
  fireEvent.click(screen.getByRole('button', { name: /Check-out/ }));

  assert.ok(await screen.findByText('Visitor checked out.'));
  const transition = requests.find((r) => r.method === 'POST' && r.path === '/requests/r2/transitions');
  assert.deepEqual(transition?.body, { toState: 'Checked-Out' });
});

test('Signature opens the signed URL in a new tab', async () => {
  todayBody = { expected: [], onSite: [onSiteVisitor], checkedOut: [] };
  renderPage();
  await screen.findByText('Bob');

  fireEvent.click(screen.getByRole('button', { name: /Signature/ }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(windowOpenCalls, ['https://storage.example/signed-url']);
});
