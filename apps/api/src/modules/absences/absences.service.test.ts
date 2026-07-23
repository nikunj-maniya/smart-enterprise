import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { getOverCapDays, listAbsences } from './absences.service.js';

/**
 * Stubbed-Prisma unit tests (forms.service.test.ts / item-catalog.service.test.ts pattern): CI has
 * no live Postgres, so the `request`, `project`, `department`, `projectMember`, and `tenant`
 * delegates are redefined as in-memory stubs. `tenant` is stubbed because `getOverCapDays` reaches
 * into `leave-types.service.ts`'s `getAbsenceCap`, which reads `Tenant.settings`.
 */

type RequestRow = {
  id: string;
  status: string;
  form: { key: string };
  requester: { id: string; name: string };
  startDate: Date | null;
  endDate: Date | null;
  halfDayCount: number | null;
  departmentId: string | null;
  projectId: string | null;
  payload: unknown;
};

function utc(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

let requestRows: RequestRow[] = [];
let projectRows: { id: string; name: string }[] = [];
let departmentRows: { id: string; name: string }[] = [];
let projectMemberRows: { projectId: string }[] = [];
let tenantSettings: Record<string, unknown> | null = null;
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
Object.defineProperty(prisma, 'project', {
  value: { findMany: async () => projectRows },
  configurable: true,
});
Object.defineProperty(prisma, 'department', {
  value: { findMany: async () => departmentRows },
  configurable: true,
});
Object.defineProperty(prisma, 'projectMember', {
  value: { findMany: async () => projectMemberRows },
  configurable: true,
});
Object.defineProperty(prisma, 'tenant', {
  value: { findUniqueOrThrow: async () => ({ settings: tenantSettings }) },
  configurable: true,
});

beforeEach(() => {
  requestRows = [];
  projectRows = [];
  departmentRows = [];
  projectMemberRows = [];
  tenantSettings = null;
  requestFindManyArgs.length = 0;
});

const HR = { id: 'hr1', roles: ['hr-head'] };
const MGMT = { id: 'admin1', roles: ['enterprise-admin'] };
const PM = { id: 'pm1', roles: ['project-manager'] };
const NOBODY = { id: 'emp1', roles: ['employee'] };

function requestRow(partial: Partial<RequestRow> & Pick<RequestRow, 'form' | 'requester' | 'startDate' | 'endDate'>): RequestRow {
  return {
    id: 'r1',
    status: 'Approved',
    halfDayCount: null,
    departmentId: null,
    projectId: null,
    payload: {},
    ...partial,
  };
}

describe('listAbsences', () => {
  it('rejects a viewer with no absence visibility (403)', async () => {
    await assert.rejects(
      listAbsences('t1', NOBODY, { from: '2026-06-01', to: '2026-06-30' }),
      (err: unknown) => err instanceof HttpError && err.status === 403,
    );
  });

  it('includes the reason field for an HR viewer, resolved from the form-specific payload key', async () => {
    requestRows = [
      requestRow({
        form: { key: 'leave' },
        requester: { id: 'p1', name: 'Alice' },
        startDate: utc('2026-06-02'),
        endDate: utc('2026-06-03'),
        payload: { context: 'Family event' },
      }),
    ];

    const { rows, scope } = await listAbsences('t1', HR, { from: '2026-06-01', to: '2026-06-30' });

    assert.equal(scope, 'hr');
    assert.equal(rows[0].reason, 'Family event');
  });

  it('reads the WFH-specific reason key ("detailed_reason"), not the leave one', async () => {
    requestRows = [
      requestRow({
        form: { key: 'wfh' },
        requester: { id: 'p1', name: 'Alice' },
        startDate: utc('2026-06-02'),
        endDate: utc('2026-06-02'),
        payload: { detailed_reason: 'Internet outage', context: 'wrong-field' },
      }),
    ];

    const { rows } = await listAbsences('t1', HR, { from: '2026-06-01', to: '2026-06-30' });

    assert.equal(rows[0].reason, 'Internet outage');
  });

  it('omits the reason key entirely for a non-HR (management) viewer — not merely null', async () => {
    requestRows = [
      requestRow({
        form: { key: 'leave' },
        requester: { id: 'p1', name: 'Alice' },
        startDate: utc('2026-06-02'),
        endDate: utc('2026-06-02'),
        payload: { context: 'Private' },
      }),
    ];

    const { rows, scope } = await listAbsences('t1', MGMT, { from: '2026-06-01', to: '2026-06-30' });

    assert.equal(scope, 'management');
    assert.equal('reason' in rows[0], false);
  });

  it('scopes a PM/TL viewer to their own led projects, via a projectId-in filter', async () => {
    projectMemberRows = [{ projectId: 'proj-1' }, { projectId: 'proj-2' }];
    requestRows = [];

    await listAbsences('t1', PM, { from: '2026-06-01', to: '2026-06-30' });

    const args = requestFindManyArgs[0] as { where: { projectId?: { in: string[] } } };
    assert.deepEqual(args.where.projectId, { in: ['proj-1', 'proj-2'] });
  });

  it('does not scope by project for an HR/management viewer', async () => {
    await listAbsences('t1', HR, { from: '2026-06-01', to: '2026-06-30' });

    const args = requestFindManyArgs[0] as { where: { projectId?: unknown } };
    assert.equal(args.where.projectId, undefined);
  });

  it('resolves department and project names from the referenced ids', async () => {
    departmentRows = [{ id: 'd1', name: 'Engineering' }];
    projectRows = [{ id: 'proj-1', name: 'Apollo' }];
    requestRows = [
      requestRow({
        form: { key: 'leave' },
        requester: { id: 'p1', name: 'Alice' },
        startDate: utc('2026-06-02'),
        endDate: utc('2026-06-02'),
        departmentId: 'd1',
        projectId: 'proj-1',
      }),
    ];

    const { rows } = await listAbsences('t1', HR, { from: '2026-06-01', to: '2026-06-30' });

    assert.equal(rows[0].departmentName, 'Engineering');
    assert.equal(rows[0].projectName, 'Apollo');
  });

  it('carries halfDayCount through as-is, defaulting to null', async () => {
    requestRows = [
      requestRow({
        form: { key: 'leave' },
        requester: { id: 'p1', name: 'Alice' },
        startDate: utc('2026-06-02'),
        endDate: utc('2026-06-02'),
        halfDayCount: 0.5,
      }),
      requestRow({
        id: 'r2',
        form: { key: 'leave' },
        requester: { id: 'p2', name: 'Bob' },
        startDate: utc('2026-06-03'),
        endDate: utc('2026-06-03'),
      }),
    ];

    const { rows } = await listAbsences('t1', HR, { from: '2026-06-01', to: '2026-06-30' });

    assert.equal(rows[0].halfDayCount, 0.5);
    assert.equal(rows[1].halfDayCount, null);
  });

  it('slices startDate/endDate to a plain YYYY-MM-DD calendar day', async () => {
    requestRows = [
      requestRow({
        form: { key: 'leave' },
        requester: { id: 'p1', name: 'Alice' },
        startDate: utc('2026-06-02'),
        endDate: utc('2026-06-05'),
      }),
    ];

    const { rows } = await listAbsences('t1', HR, { from: '2026-06-01', to: '2026-06-30' });

    assert.equal(rows[0].startDate, '2026-06-02');
    assert.equal(rows[0].endDate, '2026-06-05');
  });
});

describe('getOverCapDays', () => {
  it('rejects a PM/TL viewer with 403 (HR/Admin only)', async () => {
    await assert.rejects(
      getOverCapDays('t1', PM, { from: '2026-06-01', to: '2026-06-05' }),
      (err: unknown) => err instanceof HttpError && err.status === 403 && err.message === 'Over-cap panel is HR/Admin only',
    );
  });

  it('falls back to the default cap (3) when the tenant has no configured cap', async () => {
    tenantSettings = null;
    requestRows = [];

    const { cap } = await getOverCapDays('t1', HR, { from: '2026-06-01', to: '2026-06-05' });

    assert.equal(cap, 3);
  });

  it('uses the tenant-configured concurrent-absence cap', async () => {
    tenantSettings = { concurrentAbsenceCap: 5 };

    const { cap } = await getOverCapDays('t1', MGMT, { from: '2026-06-01', to: '2026-06-05' });

    assert.equal(cap, 5);
  });

  it('flags only days where concurrent absences exceed the cap, with the full people list', async () => {
    tenantSettings = { concurrentAbsenceCap: 2 };
    requestRows = [
      requestRow({
        id: 'a',
        form: { key: 'leave' },
        requester: { id: 'p1', name: 'Alice' },
        startDate: utc('2026-06-01'),
        endDate: utc('2026-06-02'),
      }),
      requestRow({
        id: 'b',
        form: { key: 'wfh' },
        requester: { id: 'p2', name: 'Bob' },
        startDate: utc('2026-06-02'),
        endDate: utc('2026-06-03'),
      }),
      requestRow({
        id: 'c',
        form: { key: 'leave' },
        requester: { id: 'p3', name: 'Cara' },
        startDate: utc('2026-06-02'),
        endDate: utc('2026-06-02'),
      }),
    ];

    const { days } = await getOverCapDays('t1', HR, { from: '2026-06-01', to: '2026-06-05' });

    assert.deepEqual(days, [
      {
        date: '2026-06-02',
        count: 3,
        cap: 2,
        people: [
          { personId: 'p1', personName: 'Alice' },
          { personId: 'p2', personName: 'Bob' },
          { personId: 'p3', personName: 'Cara' },
        ],
      },
    ]);
  });

  it('clips a request span to the query range before counting days', async () => {
    tenantSettings = { concurrentAbsenceCap: 0 };
    requestRows = [
      requestRow({
        form: { key: 'leave' },
        requester: { id: 'p1', name: 'Alice' },
        startDate: utc('2026-05-28'),
        endDate: utc('2026-06-10'),
      }),
    ];

    const { days } = await getOverCapDays('t1', HR, { from: '2026-06-01', to: '2026-06-02' });

    assert.deepEqual(
      days.map((d) => d.date),
      ['2026-06-01', '2026-06-02'],
    );
  });

  it('skips a request row with a missing promoted start/end date', async () => {
    tenantSettings = { concurrentAbsenceCap: 0 };
    requestRows = [
      requestRow({ form: { key: 'leave' }, requester: { id: 'p1', name: 'Alice' }, startDate: null, endDate: utc('2026-06-02') }),
    ];

    const { days } = await getOverCapDays('t1', HR, { from: '2026-06-01', to: '2026-06-05' });

    assert.deepEqual(days, []);
  });
});
