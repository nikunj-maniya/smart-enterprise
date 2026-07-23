import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import Reports from './Reports';

interface Recorded {
  method: string;
  path: string;
}

let requests: Recorded[] = [];
let summaryStatus = 200;
let summaryBody: Record<string, unknown> = {
  requestVolumes: [],
  absenceTrend: [],
  avgApprovalTurnaroundHours: null,
};
let exportStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  summaryStatus = 200;
  summaryBody = { requestVolumes: [], absenceTrend: [], avgApprovalTurnaroundHours: null };
  exportStatus = 200;
  URL.createObjectURL = (() => 'blob:mock') as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://localhost:4000', '');
    const method = init?.method ?? 'GET';
    requests.push({ method, path });
    if (path.startsWith('/reports/summary')) {
      if (summaryStatus !== 200) return new Response(JSON.stringify({ error: 'Unable to load the report.' }), { status: summaryStatus });
      return new Response(JSON.stringify(summaryBody), { status: 200 });
    }
    if (path.startsWith('/reports/export')) {
      if (exportStatus !== 200) return new Response('', { status: exportStatus });
      return new Response('date,count\n2026-07-01,3\n', { status: 200, headers: { 'Content-Type': 'text/csv' } });
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
      <Reports />
    </AuthProvider>,
  );
}

test('renders request volumes, avg turnaround, and absence trend', async () => {
  summaryBody = {
    requestVolumes: [{ formKey: 'leave', formTitle: 'Leave', status: 'Approved', count: 5 }],
    absenceTrend: [{ date: '2026-07-10', count: 3 }],
    avgApprovalTurnaroundHours: 4.5,
  };
  renderPage();
  assert.ok(await screen.findByText('Leave · Approved'));
  assert.ok(screen.getByText('5'));
  assert.ok(screen.getByText('4.5h'));
  assert.ok(screen.getByText('Jul 10'));
});

test('shows an em dash for turnaround when there is no data yet', async () => {
  renderPage();
  assert.ok(await screen.findByText('—'));
});

test('shows empty-range messages for both panels when there is no data', async () => {
  renderPage();
  assert.ok(await screen.findByText('No requests in this range.'));
  assert.ok(screen.getByText('No absences in this range.'));
});

test('Prev/Next month navigation refetches the summary for the new range', async () => {
  renderPage();
  await screen.findByText('No requests in this range.');
  const initialCalls = requests.filter((r) => r.path.startsWith('/reports/summary')).length;

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(requests.filter((r) => r.path.startsWith('/reports/summary')).length, initialCalls + 1);
});

test('shows an error state with a working Retry on a load failure', async () => {
  summaryStatus = 500;
  renderPage();
  assert.ok(await screen.findByText('Unable to load the report.'));
  summaryStatus = 200;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.ok(await screen.findByText('No requests in this range.'));
});

test('Export absences CSV downloads the file without error', async () => {
  renderPage();
  await screen.findByText('No requests in this range.');
  fireEvent.click(screen.getByRole('button', { name: /Export absences CSV/ }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(requests.some((r) => r.path.startsWith('/reports/export')));
  assert.equal(screen.queryByText('Unable to export.'), null);
});

test('a failed export shows an error next to the button', async () => {
  exportStatus = 500;
  renderPage();
  await screen.findByText('No requests in this range.');
  fireEvent.click(screen.getByRole('button', { name: /Export absences CSV/ }));
  // downloadAbsencesCsv throws its own ApiError message directly, not the generic fallback.
  assert.ok(await screen.findByText('Export failed (500)'));
});
