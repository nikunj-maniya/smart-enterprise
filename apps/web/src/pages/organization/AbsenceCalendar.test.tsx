import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { AuthUser } from '@se/shared';
import { AuthProvider } from '@/lib/auth';
import AbsenceCalendar from './AbsenceCalendar';

interface Recorded {
  method: string;
  path: string;
}

let requests: Recorded[] = [];
let currentUser: AuthUser | null = null;
let absencesBody: { rows: unknown[] } = { rows: [] };
let absencesStatus = 200;
let overCapBody: { days: unknown[] } = { days: [] };
let overCapStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  absencesBody = { rows: [] };
  absencesStatus = 200;
  overCapBody = { days: [] };
  overCapStatus = 200;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = String(input).replace('http://localhost:4000', '');
    requests.push({ method: 'GET', path });
    if (path === '/auth/me') return new Response(JSON.stringify(currentUser), { status: currentUser ? 200 : 401 });
    if (path.startsWith('/departments?')) return new Response(JSON.stringify({ rows: [], total: 0 }), { status: 200 });
    if (path.startsWith('/projects?')) return new Response(JSON.stringify({ rows: [], total: 0 }), { status: 200 });
    if (path === '/leave-types/absence-cap') return new Response(JSON.stringify({ cap: 3 }), { status: 200 });
    if (path.startsWith('/absences/over-cap')) {
      if (overCapStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load the over-cap warnings.' }), { status: overCapStatus });
      return new Response(JSON.stringify(overCapBody), { status: 200 });
    }
    if (path.startsWith('/absences?')) {
      if (absencesStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load absences.' }), { status: absencesStatus });
      return new Response(JSON.stringify(absencesBody), { status: 200 });
    }
    return new Response(JSON.stringify({ error: `No stub for GET ${path}` }), { status: 500 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  localStorage.clear();
  cleanup();
});

function loginAs(roles: string[]) {
  currentUser = {
    id: 'u1',
    name: 'Ada Lovelace',
    email: 'ada@acme.com',
    isSystemAdmin: false,
    mustChangePassword: false,
    tenantId: 't1',
    tenantName: 'Acme',
    roles,
  };
  localStorage.setItem('se.accessToken', 'at-1');
  localStorage.setItem('se.refreshToken', 'rt-1');
}

function renderPage() {
  return render(
    <AuthProvider>
      <AbsenceCalendar />
    </AuthProvider>,
  );
}

const away = {
  requestId: 'r1',
  personId: 'p1',
  personName: 'Grace Hopper',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  type: 'leave',
};

test('shows the "no one away" message when nobody is away this week', async () => {
  loginAs(['project-manager']);
  renderPage();
  assert.ok(await screen.findByText('No one away in the next 7 days.'));
});

test('lists people away this week in the sidebar', async () => {
  loginAs(['project-manager']);
  absencesBody = { rows: [away] };
  renderPage();
  await screen.findByText('Away this week');
  // "Grace Hopper" also appears as a person-filter <option> — scope to the sidebar panel.
  const panel = screen.getByText('Away this week').closest('div')!.parentElement as HTMLElement;
  assert.ok(await within(panel).findByText('Grace Hopper'));
  assert.ok(within(panel).getByText('Leave'));
});

test('an Enterprise Admin sees the over-cap warning panel', async () => {
  loginAs(['enterprise-admin']);
  overCapBody = { days: [{ date: '2026-06-15', count: 4, people: [{ personId: 'p1', personName: 'Grace Hopper' }] }] };
  renderPage();
  assert.ok(await screen.findByText('Over concurrent cap'));
  assert.ok(screen.getByText(/4 people away/));
});

test('a PM/TL viewer never sees the over-cap panel, even if it would have warnings', async () => {
  loginAs(['project-manager']);
  overCapBody = { days: [{ date: '2026-06-15', count: 4, people: [] }] };
  renderPage();
  await screen.findByText('No one away in the next 7 days.');
  assert.equal(screen.queryByText('Over concurrent cap'), null);
  assert.equal(requests.some((r) => r.path.startsWith('/absences/over-cap')), false);
});

test('an Enterprise Admin sees the over-cap error message on failure', async () => {
  loginAs(['enterprise-admin']);
  overCapStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load the over-cap warnings.'));
});

test('shows an error state with Retry when loading absences fails', async () => {
  loginAs(['project-manager']);
  absencesStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load absences.'));
  absencesStatus = 200;
  absencesBody = { rows: [away] };
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  const panel = (await screen.findByText('Away this week')).closest('div')!.parentElement as HTMLElement;
  assert.ok(await within(panel).findByText('Grace Hopper'));
});

test('switching to Agenda view toggles aria-pressed', async () => {
  loginAs(['project-manager']);
  renderPage();
  await screen.findByText('No one away in the next 7 days.');

  const agendaBtn = screen.getByRole('button', { name: 'Agenda' });
  fireEvent.click(agendaBtn);
  assert.equal(agendaBtn.getAttribute('aria-pressed'), 'true');
  assert.equal(screen.getByRole('button', { name: 'Month' }).getAttribute('aria-pressed'), 'false');
});
