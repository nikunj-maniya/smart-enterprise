import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { exportAbsencesCsv, getSummary } from './reports.service.js';

/**
 * Stubbed-Prisma unit tests (forms.service.test.ts / item-catalog.service.test.ts pattern): CI has
 * no live Postgres, so `request`, `project`, `department`, and `projectMember` are redefined as
 * in-memory stubs. `getSummary`/`exportAbsencesCsv` reuse `absences.service.ts`'s `listAbsences`
 * verbatim (design.md — "an export is just a serialized query result"), which issues its own
 * `prisma.request.findMany` call; the stub below ignores `where` filtering and returns the same
 * canned rows for both call sites, so the fixtures below are pre-shaped to already satisfy both
 * queries' real-world filters (status Approved, form key in leave/wfh) rather than relying on the
 * stub to apply them.
 */

type RequestRow = {
  id: string;
  status: string;
  form: { key: string; title: string };
  requester: { id: string; name: string };
  createdAt: Date;
  statusHistory: { toState: string; at: Date }[];
  startDate: Date | null;
  endDate: Date | null;
  halfDayCount: number | null;
  departmentId: string | null;
  projectId: string | null;
  payload: unknown;
};

function utc(day: string, time = '00:00:00.000Z'): Date {
  return new Date(`${day}T${time}`);
}

let requestRows: RequestRow[] = [];
let projectMemberRows: { projectId: string }[] = [];
const requestFindManyArgs: unknown[] = [];

Object.defineProperty(prisma, 'request', {
  value: {
    findMany: async (args: unknown) => {
      requestFindManyArgs.push(args);
      return requestRows;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'project', { value: { findMany: async () => [] }, configurable: true });
Object.defineProperty(prisma, 'department', { value: { findMany: async () => [] }, configurable: true });
Object.defineProperty(prisma, 'projectMember', {
  value: { findMany: async () => projectMemberRows },
  configurable: true,
});

beforeEach(() => {
  requestRows = [];
  projectMemberRows = [];
  requestFindManyArgs.length = 0;
});

const HR = { id: 'hr1', roles: ['hr-head'] };
const MGMT = { id: 'admin1', roles: ['enterprise-admin'] };
const PM = { id: 'pm1', roles: ['project-manager'] };

function row(partial: Partial<RequestRow> & Pick<RequestRow, 'form' | 'requester' | 'createdAt'>): RequestRow {
  // The stub `prisma.request.findMany` (below) ignores `where` filtering and returns every row to
  // both `getSummary`'s own query and `absences.service.ts`'s `listAbsences` (which non-null-
  // asserts `startDate`/`endDate`) — default both to `createdAt` so rows not exercising the
  // absence-trend behavior don't need to care about it.
  return {
    id: 'r1',
    status: 'Approved',
    statusHistory: [],
    startDate: partial.createdAt,
    endDate: partial.createdAt,
    halfDayCount: null,
    departmentId: null,
    projectId: null,
    payload: {},
    ...partial,
  };
}

describe('getSummary', () => {
  it('aggregates request volumes grouped by form key and status', async () => {
    requestRows = [
      row({ id: 'r1', form: { key: 'leave', title: 'Leave Request' }, requester: { id: 'p1', name: 'Alice' }, createdAt: utc('2026-06-01'), status: 'Approved' }),
      row({ id: 'r2', form: { key: 'leave', title: 'Leave Request' }, requester: { id: 'p2', name: 'Bob' }, createdAt: utc('2026-06-02'), status: 'Approved' }),
      row({ id: 'r3', form: { key: 'wfh', title: 'Work From Home' }, requester: { id: 'p1', name: 'Alice' }, createdAt: utc('2026-06-03'), status: 'Pending' }),
    ];

    const summary = await getSummary('t1', HR, { from: '2026-06-01', to: '2026-06-30' });

    assert.deepEqual(summary.requestVolumes, [
      { formKey: 'leave', formTitle: 'Leave Request', status: 'Approved', count: 2 },
      { formKey: 'wfh', formTitle: 'Work From Home', status: 'Pending', count: 1 },
    ]);
  });

  it('averages approval turnaround hours across decided requests only', async () => {
    requestRows = [
      row({
        id: 'r1',
        form: { key: 'leave', title: 'Leave Request' },
        requester: { id: 'p1', name: 'Alice' },
        createdAt: utc('2026-06-01', '00:00:00.000Z'),
        statusHistory: [{ toState: 'Approved', at: utc('2026-06-01', '10:00:00.000Z') }], // 10h
      }),
      row({
        id: 'r2',
        form: { key: 'leave', title: 'Leave Request' },
        requester: { id: 'p2', name: 'Bob' },
        createdAt: utc('2026-06-02', '00:00:00.000Z'),
        statusHistory: [{ toState: 'Rejected', at: utc('2026-06-02', '20:00:00.000Z') }], // 20h
      }),
      row({
        id: 'r3',
        form: { key: 'wfh', title: 'Work From Home' },
        requester: { id: 'p1', name: 'Alice' },
        createdAt: utc('2026-06-03'),
        status: 'Pending',
        statusHistory: [{ toState: 'Pending Approval', at: utc('2026-06-03') }], // not decided — excluded
      }),
    ];

    const summary = await getSummary('t1', HR, { from: '2026-06-01', to: '2026-06-30' });

    assert.equal(summary.avgApprovalTurnaroundHours, 15); // (10 + 20) / 2
  });

  it('reports a null avg turnaround when no request in range has been decided', async () => {
    requestRows = [
      row({ id: 'r1', form: { key: 'leave', title: 'Leave Request' }, requester: { id: 'p1', name: 'Alice' }, createdAt: utc('2026-06-01'), status: 'Pending' }),
    ];

    const summary = await getSummary('t1', HR, { from: '2026-06-01', to: '2026-06-30' });

    assert.equal(summary.avgApprovalTurnaroundHours, null);
  });

  it('builds the absence trend day-by-day from approved leave/wfh requests, clipped to the query range', async () => {
    requestRows = [
      row({
        id: 'r1',
        form: { key: 'leave', title: 'Leave Request' },
        requester: { id: 'p1', name: 'Alice' },
        createdAt: utc('2026-06-01'),
        startDate: utc('2026-06-01'),
        endDate: utc('2026-06-02'),
      }),
    ];

    const summary = await getSummary('t1', HR, { from: '2026-06-01', to: '2026-06-30' });

    assert.deepEqual(summary.absenceTrend, [
      { date: '2026-06-01', count: 1 },
      { date: '2026-06-02', count: 1 },
    ]);
  });

  it("carries the viewer's resolved visibility tier through as `scope`", async () => {
    assert.equal((await getSummary('t1', HR, { from: '2026-06-01', to: '2026-06-30' })).scope, 'hr');
    assert.equal((await getSummary('t1', MGMT, { from: '2026-06-01', to: '2026-06-30' })).scope, 'management');
  });

  it('scopes a PM/TL viewer to their led projects in the underlying request query', async () => {
    projectMemberRows = [{ projectId: 'proj-1' }];

    await getSummary('t1', PM, { from: '2026-06-01', to: '2026-06-30' });

    const firstCallArgs = requestFindManyArgs[0] as { where: { projectId?: { in: string[] } } };
    assert.deepEqual(firstCallArgs.where.projectId, { in: ['proj-1'] });
  });
});

describe('exportAbsencesCsv', () => {
  it('includes a reason column for an HR viewer and escapes a comma-bearing value', async () => {
    requestRows = [
      row({
        id: 'r1',
        form: { key: 'leave', title: 'Leave Request' },
        requester: { id: 'p1', name: 'Doe, Jane' },
        createdAt: utc('2026-06-01'),
        startDate: utc('2026-06-01'),
        endDate: utc('2026-06-01'),
        payload: { context: 'Family event' },
      }),
    ];

    const csv = await exportAbsencesCsv('t1', HR, { from: '2026-06-01', to: '2026-06-30' });
    const lines = csv.split('\n');

    assert.equal(lines[0], 'personName,type,startDate,endDate,departmentName,projectName,reason');
    assert.equal(lines[1], '"Doe, Jane",leave,2026-06-01,2026-06-01,,,Family event');
  });

  it('omits the reason column for a non-HR (management) viewer', async () => {
    requestRows = [
      row({
        id: 'r1',
        form: { key: 'leave', title: 'Leave Request' },
        requester: { id: 'p1', name: 'Alice' },
        createdAt: utc('2026-06-01'),
        startDate: utc('2026-06-01'),
        endDate: utc('2026-06-01'),
        payload: { context: 'Private' },
      }),
    ];

    const csv = await exportAbsencesCsv('t1', MGMT, { from: '2026-06-01', to: '2026-06-30' });
    const lines = csv.split('\n');

    assert.equal(lines[0], 'personName,type,startDate,endDate,departmentName,projectName');
    assert.equal(lines[1], 'Alice,leave,2026-06-01,2026-06-01,,');
  });

  it('returns just the header row when there are no absences in range', async () => {
    const csv = await exportAbsencesCsv('t1', HR, { from: '2026-06-01', to: '2026-06-30' });
    assert.equal(csv, 'personName,type,startDate,endDate,departmentName,projectName,reason');
  });
});
