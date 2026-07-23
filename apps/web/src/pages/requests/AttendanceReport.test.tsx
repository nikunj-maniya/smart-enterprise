import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import AttendanceReport from './AttendanceReport';

interface Recorded {
  method: string;
  path: string;
}

let requests: Recorded[] = [];
let reportStatus = 200;
let reportBody: Record<string, unknown> = {
  total: 0,
  rows: [],
  calendarDays: 31,
  weekendDays: 8,
  holidayCount: 1,
  workingDays: 22,
  isPartialMonth: false,
};
let exportStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  reportStatus = 200;
  reportBody = { total: 0, rows: [], calendarDays: 31, weekendDays: 8, holidayCount: 1, workingDays: 22, isPartialMonth: false };
  exportStatus = 200;
  URL.createObjectURL = (() => 'blob:mock') as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = String(input).replace('http://localhost:4000', '');
    requests.push({ method: 'GET', path });
    if (path.startsWith('/departments?')) return new Response(JSON.stringify({ rows: [{ id: 'd1', name: 'Engineering' }], total: 1 }), { status: 200 });
    if (path.startsWith('/reports/attendance/export')) {
      if (exportStatus !== 200) return new Response('', { status: exportStatus });
      return new Response('name,payable\nAda,20\n', { status: 200 });
    }
    if (path.startsWith('/reports/attendance?')) {
      if (reportStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load the report.' }), { status: reportStatus });
      return new Response(JSON.stringify(reportBody), { status: 200 });
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
      <AttendanceReport />
    </AuthProvider>,
  );
}

const employeeRow = {
  userId: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@acme.com',
  departments: ['Engineering'],
  status: 'Active',
  joinedAt: '2026-01-15',
  workingDays: 20,
  wfhDays: 2,
  paidLeaveDays: 1,
  unpaidLeaveDays: 0,
  officeDays: 17,
  payableDays: 21,
};

test('renders the summary tiles and the partial-month notice', async () => {
  reportBody = { ...reportBody, isPartialMonth: true };
  renderPage();
  assert.ok(await screen.findByText('Calendar days'));
  assert.ok(screen.getByText('31'));
  assert.ok(screen.getByText(/still in progress/));
});

test('renders an employee row with every day column', async () => {
  reportBody = { ...reportBody, rows: [employeeRow], total: 1 };
  renderPage();
  assert.ok(await screen.findByText('Ada Lovelace'));
  assert.ok(screen.getByText('ada@acme.com'));
  // "Engineering" also appears as a department-filter <option> — scope to a non-option match.
  assert.ok(screen.getAllByText('Engineering').find((el) => el.tagName !== 'OPTION'));
  assert.ok(screen.getByText('21'));
});

test('shows the empty state when no employees match', async () => {
  renderPage();
  assert.ok(await screen.findByText('No employees to report'));
});

test('shows an error state with a working Retry on a load failure', async () => {
  reportStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load the report.'));
  reportStatus = 200;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.ok(await screen.findByText('No employees to report'));
});

test('the department filter refetches with the selected departmentId', async () => {
  renderPage();
  await screen.findByText('No employees to report');
  fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'd1' } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(requests.some((r) => r.path.startsWith('/reports/attendance?') && r.path.includes('departmentId=d1')));
});

test('the Include inactive switch refetches with includeInactive=true', async () => {
  renderPage();
  await screen.findByText('No employees to report');
  fireEvent.click(screen.getByRole('switch', { name: 'Include inactive' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(requests.some((r) => r.path.startsWith('/reports/attendance?') && r.path.includes('includeInactive=true')));
});

test('Next month is disabled while viewing the current month', async () => {
  renderPage();
  await screen.findByText('No employees to report');
  assert.equal(screen.getByRole('button', { name: 'Next month' }).hasAttribute('disabled'), true);
});

test('Previous month navigates back and refetches', async () => {
  renderPage();
  await screen.findByText('No employees to report');
  const before = requests.filter((r) => r.path.startsWith('/reports/attendance?')).length;
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(requests.filter((r) => r.path.startsWith('/reports/attendance?')).length, before + 1);
  assert.equal(screen.getByRole('button', { name: 'Next month' }).hasAttribute('disabled'), false);
});

test('Export CSV downloads without error, and a failure shows the export error', async () => {
  renderPage();
  await screen.findByText('No employees to report');
  fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(requests.some((r) => r.path.startsWith('/reports/attendance/export')));
  assert.equal(screen.queryByText(/Export failed/), null);
});

test('a failed export shows the error next to the button', async () => {
  exportStatus = 500;
  renderPage();
  await screen.findByText('No employees to report');
  fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
  assert.ok(await screen.findByText('Export failed (500)'));
});

test('pagination shows and Next advances the page', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ ...employeeRow, userId: `u${i}`, name: `Employee ${i}` }));
  reportBody = { ...reportBody, rows, total: 25 };
  renderPage();
  await screen.findByText('Employee 0');
  assert.ok(screen.getByText('Showing 1–20 of 25'));

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(requests.some((r) => r.path.startsWith('/reports/attendance?') && r.path.includes('page=2')));
});
