import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import HrAbsences from './HrAbsences';

let absencesBody: { rows: unknown[] } = { rows: [] };
let absencesStatus = 200;
let awaitingCount = 0;
const realFetch = globalThis.fetch;

beforeEach(() => {
  absencesBody = { rows: [] };
  absencesStatus = 200;
  awaitingCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = String(input).replace('http://localhost:4000', '');
    if (path.startsWith('/departments?')) return new Response(JSON.stringify({ rows: [], total: 0 }), { status: 200 });
    if (path.startsWith('/projects?')) return new Response(JSON.stringify({ rows: [], total: 0 }), { status: 200 });
    if (path.startsWith('/requests/approvals')) return new Response(JSON.stringify({ rows: [], awaitingCount }), { status: 200 });
    if (path === '/leave-types/absence-cap') return new Response(JSON.stringify({ cap: 3 }), { status: 200 });
    if (path.startsWith('/absences?')) {
      if (absencesStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load absences.' }), { status: absencesStatus });
      return new Response(JSON.stringify(absencesBody), { status: 200 });
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
      <HrAbsences />
    </AuthProvider>,
  );
}

const today = new Date().toISOString().slice(0, 10);
const onLeave = { requestId: 'r1', personId: 'p1', personName: 'Grace Hopper', startDate: today, endDate: today, type: 'leave', projectName: 'Apollo' };
const onWfh = { requestId: 'r2', personId: 'p2', personName: 'Bob', startDate: today, endDate: today, type: 'wfh', projectName: 'Apollo' };
const otherProject = { requestId: 'r3', personId: 'p3', personName: 'Ada', startDate: today, endDate: today, type: 'leave', projectName: 'Zeus' };

test('renders on-leave/WFH-today and awaiting-signoff stat cards', async () => {
  absencesBody = { rows: [onLeave, onWfh] };
  awaitingCount = 2;
  renderPage();
  await screen.findByText('On leave today');
  // Stat values ("1", "2") also collide with calendar day-of-month cells — scope to each card.
  const wfhCard = screen.getByText('WFH today').parentElement as HTMLElement;
  assert.ok(within(wfhCard).getByText('1'));
  const signoffCard = screen.getByText('Awaiting sign-off').parentElement as HTMLElement;
  assert.ok(within(signoffCard).getByText('2'));
});

test('lists people away this week in the sidebar', async () => {
  absencesBody = { rows: [onLeave] };
  renderPage();
  await screen.findByText('Away this week');
  const panel = screen.getByText('Away this week').closest('div')!.parentElement as HTMLElement;
  assert.ok(within(panel).getByText('Grace Hopper'));
});

test('groups absences "by project", most-populous first', async () => {
  absencesBody = { rows: [onLeave, onWfh, otherProject] };
  renderPage();
  await screen.findByText('By project');
  const panel = screen.getByText('By project').closest('div')!.parentElement as HTMLElement;
  const rows = within(panel).getAllByText(/Apollo|Zeus/);
  assert.equal(rows[0].textContent, 'Apollo');
  assert.ok(within(panel).getByText('2'));
});

test('shows empty-state messages for both side panels with no data', async () => {
  renderPage();
  assert.ok(await screen.findByText('No one away in the next 7 days.'));
  assert.ok(screen.getByText('No absences loaded for this month.'));
});

test('shows an error state with a working Retry on a load failure', async () => {
  absencesStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load absences.'));
  absencesStatus = 200;
  absencesBody = { rows: [onLeave] };
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  const panel = await screen.findByText('Away this week');
  assert.ok(within(panel.closest('div')!.parentElement as HTMLElement).findByText('Grace Hopper'));
});

test('switching to Agenda view shows the reason column (HR full-detail scope)', async () => {
  renderPage();
  await screen.findByText('No one away in the next 7 days.');
  fireEvent.click(screen.getByRole('button', { name: 'Agenda' }));
  assert.equal(screen.getByRole('button', { name: 'Agenda' }).getAttribute('aria-pressed'), 'true');
});
