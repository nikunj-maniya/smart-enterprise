import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import Overview from './Overview';

let overviewBody: unknown = null;
const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async () => new Response(JSON.stringify(overviewBody), { status: 200 })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Overview />
      </MemoryRouter>
    </AuthProvider>,
  );
}

test('renders the 4 stat card values', async () => {
  overviewBody = {
    counts: { pending: 3, active: 12, users: 250, suspended: 1 },
    latestRegistrations: [],
    recentActivity: [],
  };
  renderPage();
  assert.ok(await screen.findByText('3'));
  assert.ok(screen.getByText('12'));
  assert.ok(screen.getByText('250'));
  assert.ok(screen.getByText('1'));
  assert.ok(screen.getByText('Pending Review'));
  assert.ok(screen.getByText('Active Enterprises'));
});

test('renders the latest registrations list with a status badge', async () => {
  overviewBody = {
    counts: { pending: 0, active: 0, users: 0, suspended: 0 },
    latestRegistrations: [
      { id: 'r1', companyName: 'Acme Corp', contactName: 'Jane Doe', createdAt: '2026-06-01T00:00:00.000Z', status: 'Pending' },
    ],
    recentActivity: [],
  };
  renderPage();
  assert.ok(await screen.findByText('Acme Corp'));
  assert.ok(screen.getByText(/Jane Doe/));
  assert.ok(screen.getByText('Pending'));
});

test('renders recent activity with the actor and action label', async () => {
  overviewBody = {
    counts: { pending: 0, active: 0, users: 0, suspended: 0 },
    latestRegistrations: [],
    recentActivity: [{ id: 'a1', action: 'suspend', target: 'Globex', actor: 'Ada', at: '2026-06-01T00:00:00.000Z' }],
  };
  renderPage();
  assert.ok(await screen.findByText('Suspended enterprise'));
  assert.ok(screen.getByText(/Globex/));
  assert.ok(screen.getByText(/Ada/));
});

test('shows empty states for both lists when they are empty', async () => {
  overviewBody = {
    counts: { pending: 0, active: 0, users: 0, suspended: 0 },
    latestRegistrations: [],
    recentActivity: [],
  };
  renderPage();
  assert.ok(await screen.findByText('No registrations yet.'));
  assert.ok(screen.getByText('No activity yet.'));
});

test('the "Review queue" link points to /registrations', async () => {
  overviewBody = {
    counts: { pending: 0, active: 0, users: 0, suspended: 0 },
    latestRegistrations: [],
    recentActivity: [],
  };
  renderPage();
  const link = await screen.findByRole('link', { name: /Review queue/ });
  assert.equal(link.getAttribute('href'), '/registrations');
});
