import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SystemRoleKey,
  type ApprovalQueueItemDto,
  type DepartmentDto,
  type DocumentSearchResultDto,
  type FrontDeskVisitorDto,
  type HolidayDto,
  type LeaveBalanceDto,
  type OrgUserDto,
  type ProjectDto,
  type RoleDto,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { redisConnection } from '../../lib/redis.js';
import { HttpError } from '../../lib/http-error.js';
import type { Viewer } from '../requests/visibility-policy.js';
import {
  queryAbsencesArgsSchema,
  queryDepartmentsArgsSchema,
  queryHolidaysArgsSchema,
  queryMyApprovalsArgsSchema,
  queryProjectsArgsSchema,
  queryRolesArgsSchema,
  resolveDateRange,
  searchDocsArgsSchema,
  SMART_SEARCH_TOOLS,
} from './smart-search.tools.js';

// smart-search.tools.js transitively imports the BullMQ `redisConnection` (via queryMyRequests ->
// requests.service.js -> notifications.service.js -> slack-delivery.js), which connects eagerly
// and retries indefinitely — left alone, that keeps this process alive with no live Redis in CI.
// Silence its connection errors and disconnect immediately (requests.service.test.ts pattern).
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * `resolveDateRange` is the one place the tool resolves a relative range word to concrete dates
 * using the server's clock — the model is never asked to compute or state a date itself (see
 * smart-search.tools.ts). A fixed Wednesday is used as "now" so week-boundary math is unambiguous.
 */
const WEDNESDAY = new Date('2026-08-05T10:00:00.000Z'); // 2026-08-05 is a Wednesday

describe('resolveDateRange', () => {
  it('"today" resolves to the current calendar day', () => {
    assert.deepEqual(resolveDateRange('today', undefined, undefined, WEDNESDAY), {
      from: '2026-08-05',
      to: '2026-08-05',
    });
  });

  it('"this_week" resolves to the Monday–Sunday span containing today', () => {
    assert.deepEqual(resolveDateRange('this_week', undefined, undefined, WEDNESDAY), {
      from: '2026-08-03',
      to: '2026-08-09',
    });
  });

  it('"next_week" resolves to the following Monday–Sunday span', () => {
    assert.deepEqual(resolveDateRange('next_week', undefined, undefined, WEDNESDAY), {
      from: '2026-08-10',
      to: '2026-08-16',
    });
  });

  it('"this_month" resolves to the first–last day of the current month', () => {
    assert.deepEqual(resolveDateRange('this_month', undefined, undefined, WEDNESDAY), {
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('"custom" passes the given rangeStart/rangeEnd through untouched', () => {
    assert.deepEqual(resolveDateRange('custom', '2026-01-01', '2026-01-15', WEDNESDAY), {
      from: '2026-01-01',
      to: '2026-01-15',
    });
  });

  it('"this_week" anchors correctly when today is a Sunday (Date#getDay()===0 edge case)', () => {
    const sunday = new Date('2026-08-09T10:00:00.000Z');
    assert.deepEqual(resolveDateRange('this_week', undefined, undefined, sunday), {
      from: '2026-08-03',
      to: '2026-08-09',
    });
  });
});

describe('queryAbsencesArgsSchema', () => {
  it('accepts a non-custom range with no rangeStart/rangeEnd', () => {
    assert.equal(queryAbsencesArgsSchema.safeParse({ range: 'next_week' }).success, true);
  });

  it('rejects "custom" range with rangeStart/rangeEnd missing', () => {
    assert.equal(queryAbsencesArgsSchema.safeParse({ range: 'custom' }).success, false);
  });

  it('accepts "custom" range when both rangeStart and rangeEnd are given', () => {
    const result = queryAbsencesArgsSchema.safeParse({ range: 'custom', rangeStart: '2026-01-01', rangeEnd: '2026-01-02' });
    assert.equal(result.success, true);
  });

  it('rejects an unrecognized range value', () => {
    assert.equal(queryAbsencesArgsSchema.safeParse({ range: 'last_year' }).success, false);
  });
});

function viewer(id: string, roles: string[]): Viewer {
  return { id, roles };
}

const EMPLOYEE = viewer('emp1', [SystemRoleKey.Employee]);

describe('queryDepartments', () => {
  const tool = SMART_SEARCH_TOOLS.find((t) => t.name === 'queryDepartments')!;
  let departmentRows: { id: string; name: string; archived: boolean; heads: never[]; _count: { users: number } }[] = [];

  Object.defineProperty(prisma, 'department', {
    value: {
      findMany: async () => departmentRows,
      count: async () => departmentRows.length,
    },
    configurable: true,
  });

  beforeEach(() => {
    departmentRows = [];
  });

  it('an Employee (none of the Enterprise Admin/HR Head/PM/Tech Lead roles) is denied with HttpError(403)', async () => {
    await assert.rejects(
      () => tool.execute('t1', EMPLOYEE, { search: undefined, archived: undefined }),
      (err: unknown) => err instanceof HttpError && err.status === 403,
    );
  });

  it('a Tech Lead (one of the allowed roles) gets real rows', async () => {
    departmentRows = [{ id: 'd1', name: 'Engineering', archived: false, heads: [], _count: { users: 3 } }];
    const techLead = viewer('tl1', [SystemRoleKey.TechLead]);
    const rows = (await tool.execute('t1', techLead, { search: undefined, archived: undefined })) as DepartmentDto[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Engineering');
  });
});

describe('queryDepartmentsArgsSchema', () => {
  it('normalizes an explicit null (model-supplied unset arg) to undefined', () => {
    const result = queryDepartmentsArgsSchema.parse({ search: null, archived: null });
    assert.equal(result.search, undefined);
    assert.equal(result.archived, undefined);
  });

  it('passes a real boolean archived value through untouched', () => {
    assert.equal(queryDepartmentsArgsSchema.parse({ archived: true }).archived, true);
  });
});

describe('queryProjects', () => {
  const tool = SMART_SEARCH_TOOLS.find((t) => t.name === 'queryProjects')!;
  let projectRows: { id: string; name: string; status: string; members: never[] }[] = [];

  Object.defineProperty(prisma, 'project', {
    value: {
      findMany: async () => projectRows,
      count: async () => projectRows.length,
    },
    configurable: true,
  });

  beforeEach(() => {
    projectRows = [];
  });

  it('an Employee is denied with HttpError(403)', async () => {
    await assert.rejects(
      () => tool.execute('t1', EMPLOYEE, { search: undefined, status: undefined }),
      (err: unknown) => err instanceof HttpError && err.status === 403,
    );
  });

  it('a Project Manager (one of the allowed roles) gets real rows', async () => {
    projectRows = [{ id: 'p1', name: 'Project Phoenix', status: 'active', members: [] }];
    const pm = viewer('pm1', [SystemRoleKey.ProjectManager]);
    const rows = (await tool.execute('t1', pm, { search: undefined, status: undefined })) as ProjectDto[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Project Phoenix');
  });
});

describe('queryProjectsArgsSchema', () => {
  it('normalizes an explicit null status to undefined', () => {
    assert.equal(queryProjectsArgsSchema.parse({ search: null, status: null }).status, undefined);
  });

  it('rejects a status outside the active/archived enum', () => {
    assert.equal(queryProjectsArgsSchema.safeParse({ status: 'deleted' }).success, false);
  });
});

describe('queryHolidays', () => {
  const tool = SMART_SEARCH_TOOLS.find((t) => t.name === 'queryHolidays')!;
  let holidayRows: { id: string; date: Date; name: string }[] = [];
  let lastWhere: { date: { gte: Date; lt: Date } } | undefined;

  Object.defineProperty(prisma, 'holiday', {
    value: {
      findMany: async (args: { where: { date: { gte: Date; lt: Date } } }) => {
        lastWhere = args.where;
        return holidayRows;
      },
    },
    configurable: true,
  });

  beforeEach(() => {
    holidayRows = [];
    lastWhere = undefined;
  });

  it('an Employee (no special role) gets real rows — no permission check exists for holidays', async () => {
    holidayRows = [{ id: 'h1', date: new Date('2026-01-26T00:00:00.000Z'), name: 'Republic Day' }];
    const rows = (await tool.execute('t1', EMPLOYEE, { year: undefined })) as HolidayDto[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Republic Day');
  });

  it('omitting year defaults to the current calendar year, not a hardcoded one', async () => {
    await tool.execute('t1', EMPLOYEE, { year: undefined });
    assert.equal(lastWhere!.date.gte.getUTCFullYear(), new Date().getFullYear());
  });

  it('an explicit year is passed through instead of the current year', async () => {
    await tool.execute('t1', EMPLOYEE, { year: 2020 });
    assert.equal(lastWhere!.date.gte.getUTCFullYear(), 2020);
  });
});

describe('queryHolidaysArgsSchema', () => {
  it('normalizes an explicit null year (model-supplied unset arg) to undefined', () => {
    assert.equal(queryHolidaysArgsSchema.parse({ year: null }).year, undefined);
  });

  it('accepts an explicit year', () => {
    assert.equal(queryHolidaysArgsSchema.parse({ year: 2027 }).year, 2027);
  });
});

describe('queryMyLeaveBalances', () => {
  const tool = SMART_SEARCH_TOOLS.find((t) => t.name === 'queryMyLeaveBalances')!;
  let leaveBalanceRows: { leaveType: { id: string; name: string; quota: number }; balance: number }[] = [];
  let lastWhere: { userId: string } | undefined;

  Object.defineProperty(prisma, 'leaveBalance', {
    value: {
      findMany: async (args: { where: { userId: string } }) => {
        lastWhere = args.where;
        return leaveBalanceRows;
      },
    },
    configurable: true,
  });

  beforeEach(() => {
    leaveBalanceRows = [];
    lastWhere = undefined;
  });

  it('an Employee gets their own balance rows — no role check exists for viewing your own balance', async () => {
    leaveBalanceRows = [{ leaveType: { id: 'lt1', name: 'Sick Leave', quota: 10 }, balance: 7 }];
    const rows = (await tool.execute('t1', EMPLOYEE, {})) as LeaveBalanceDto[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].used, 3);
  });

  it('scopes the query to the viewer\'s own userId, never a supplied one', async () => {
    const someoneElse = viewer('e42', []);
    await tool.execute('t1', someoneElse, {});
    assert.equal(lastWhere!.userId, 'e42');
  });
});

describe('queryMyApprovals', () => {
  const tool = SMART_SEARCH_TOOLS.find((t) => t.name === 'queryMyApprovals')!;
  type ApproverRow = {
    decision: string | null;
    approverId: string;
    roleContext: string | null;
    comment: string | null;
    escalatedFromId: string | null;
    escalationCause: string | null;
    request: {
      id: string;
      form: { key: string; title: string };
      requester: { id: string; name: string; jobTitle: string | null };
      startDate: Date | null;
      endDate: Date | null;
      createdAt: Date;
      status: string;
      overBalance: boolean | null;
      specialConditionFlagged: boolean | null;
      approvers: ApproverRow[];
    };
  };
  let approverRows: ApproverRow[] = [];
  let lastWhere: { approverId: string } | undefined;

  function approverRow(): ApproverRow {
    const chain: ApproverRow = {
      decision: 'pending',
      approverId: 'approver-9',
      roleContext: null,
      comment: null,
      escalatedFromId: null,
      escalationCause: null,
      request: {
        id: 'req-1',
        form: { key: 'leave', title: 'Leave' },
        requester: { id: 'req1', name: 'Requester One', jobTitle: null },
        startDate: null,
        endDate: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        status: 'Pending Approval',
        overBalance: null,
        specialConditionFlagged: null,
        approvers: [],
      },
    };
    chain.request.approvers = [chain];
    return chain;
  }

  Object.defineProperty(prisma, 'requestApprover', {
    value: {
      count: async () => approverRows.length,
      findMany: async (args: { where: { approverId: string } }) => {
        lastWhere = args.where;
        return approverRows;
      },
    },
    configurable: true,
  });
  Object.defineProperty(prisma, 'user', {
    value: { findMany: async () => [] },
    configurable: true,
  });

  beforeEach(() => {
    approverRows = [];
    lastWhere = undefined;
  });

  it('an Employee gets their own pending approvals — no role check exists', async () => {
    approverRows = [approverRow()];
    const rows = (await tool.execute('t1', EMPLOYEE, { tab: 'pending' })) as ApprovalQueueItemDto[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].requestId, 'req-1');
  });

  it('scopes the query to the viewer as approverId, never a supplied one', async () => {
    const approver = viewer('approver-42', []);
    await tool.execute('t1', approver, { tab: 'pending' });
    assert.equal(lastWhere!.approverId, 'approver-42');
  });
});

describe('queryMyApprovalsArgsSchema', () => {
  it('defaults tab to "pending" when omitted', () => {
    assert.equal(queryMyApprovalsArgsSchema.parse({}).tab, 'pending');
  });

  it('defaults tab to "pending" when explicitly null (model-supplied unset arg)', () => {
    assert.equal(queryMyApprovalsArgsSchema.parse({ tab: null }).tab, 'pending');
  });

  it('accepts an explicit "decided" tab', () => {
    assert.equal(queryMyApprovalsArgsSchema.parse({ tab: 'decided' }).tab, 'decided');
  });
});

describe('queryFrontDeskVisitors', () => {
  const tool = SMART_SEARCH_TOOLS.find((t) => t.name === 'queryFrontDeskVisitors')!;
  type RequestRow = {
    id: string;
    payload: Record<string, unknown>;
    startDate: Date | null;
    status: string;
    visitor: { checkInAt: Date | null; checkOutAt: Date | null } | null;
  };
  let requestRows: RequestRow[] = [];

  Object.defineProperty(prisma, 'request', {
    value: { findMany: async () => requestRows },
    configurable: true,
  });
  // Last `prisma.user` mock in this file wins for every describe block above too (Object.defineProperty
  // calls all run synchronously at registration time, before any `it` runs) — harmless here since none
  // of queryMyApprovals's assertions depend on the actual host/approver names it resolves.
  Object.defineProperty(prisma, 'user', {
    value: { findMany: async () => [{ id: 'host-1', name: 'Hank Host' }] },
    configurable: true,
  });

  beforeEach(() => {
    requestRows = [];
  });

  it('an Employee (neither Enterprise Admin nor HR Head) is denied with HttpError(403)', async () => {
    await assert.rejects(
      () => tool.execute('t1', EMPLOYEE, {}),
      (err: unknown) => err instanceof HttpError && err.status === 403,
    );
  });

  it("an HR Head gets today's visitors, flattened across expected/on-site/checked-out", async () => {
    requestRows = [
      {
        id: 'req-expected',
        payload: { visitor_name: 'Vera Visitor', mobile: '9999999999', whom_to_meet: 'host-1', purpose: 'Demo' },
        startDate: new Date(),
        status: 'Approved',
        visitor: null,
      },
      {
        id: 'req-onsite',
        payload: { visitor_name: 'Otto Onsite', mobile: '8888888888', whom_to_meet: 'host-1', purpose: 'Meeting' },
        startDate: new Date(),
        status: 'Checked-In',
        visitor: { checkInAt: new Date(), checkOutAt: null },
      },
    ];
    const hrHead = viewer('hr1', [SystemRoleKey.HrHead]);
    const rows = (await tool.execute('t1', hrHead, {})) as FrontDeskVisitorDto[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].visitorName, 'Vera Visitor');
    assert.equal(rows[0].hostName, 'Hank Host');
    assert.equal(rows[1].checkInAt !== null, true);
  });
});

describe('queryUsers', () => {
  const tool = SMART_SEARCH_TOOLS.find((t) => t.name === 'queryUsers')!;
  const ADMIN = viewer('admin1', [SystemRoleKey.EnterpriseAdmin]);
  const noArgs = { search: undefined, status: undefined, departmentId: undefined, role: undefined };

  let userRows: {
    id: string;
    name: string;
    email: string;
    status: string;
    roles: { role: { id: string; name: string } }[];
    departments: never[];
    createdAt: Date;
  }[] = [];
  let roleRows: { id: string; name: string; isSystem: boolean; permissions: string[]; archived: boolean; _count: { users: number } }[] = [];

  // Every other describe block in this file registers its `prisma.<model>` mock once, at the top
  // level, which permanently overwrites the shared prisma singleton for the rest of the file (see
  // the queryFrontDeskVisitors comment above) — a real test-isolation bug this file has already hit
  // once. Saving/restoring the descriptor in beforeEach/afterEach instead keeps this block's mocks
  // scoped to its own tests, whichever position it runs in.
  let origUser: PropertyDescriptor | undefined;
  let origRole: PropertyDescriptor | undefined;

  beforeEach(() => {
    userRows = [];
    roleRows = [];
    origUser = Object.getOwnPropertyDescriptor(prisma, 'user');
    origRole = Object.getOwnPropertyDescriptor(prisma, 'role');
    Object.defineProperty(prisma, 'user', {
      value: { findMany: async () => userRows, count: async () => userRows.length },
      configurable: true,
    });
    Object.defineProperty(prisma, 'role', {
      value: { findMany: async () => roleRows, count: async () => roleRows.length },
      configurable: true,
    });
  });

  afterEach(() => {
    if (origUser) Object.defineProperty(prisma, 'user', origUser);
    if (origRole) Object.defineProperty(prisma, 'role', origRole);
  });

  it('an Employee (not Enterprise Admin) is denied with HttpError(403)', async () => {
    await assert.rejects(
      () => tool.execute('t1', EMPLOYEE, noArgs),
      (err: unknown) => err instanceof HttpError && err.status === 403,
    );
  });

  it('resolves a free-text role name to a role id and filters the directory by it', async () => {
    roleRows = [
      { id: 'role-pm', name: 'Project Manager', isSystem: true, permissions: [], archived: false, _count: { users: 1 } },
    ];
    userRows = [
      {
        id: 'u1',
        name: 'Priya PM',
        email: 'priya@x.com',
        status: 'Active',
        roles: [{ role: { id: 'role-pm', name: 'Project Manager' } }],
        departments: [],
        createdAt: new Date(),
      },
    ];
    const rows = (await tool.execute('t1', ADMIN, { ...noArgs, role: 'project manager' })) as OrgUserDto[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Priya PM');
  });

  it('returns no rows (not an error) when the given role name matches nothing', async () => {
    roleRows = [];
    userRows = [
      { id: 'u1', name: 'Someone', email: 'x@x.com', status: 'Active', roles: [], departments: [], createdAt: new Date() },
    ];
    const rows = (await tool.execute('t1', ADMIN, { ...noArgs, role: 'not a real role' })) as OrgUserDto[];
    assert.equal(rows.length, 0);
  });
});

describe('search_docs', () => {
  const tool = SMART_SEARCH_TOOLS.find((t) => t.name === 'search_docs')!;
  let queryRawCalls: unknown[][] = [];
  const realFetch = globalThis.fetch;

  Object.defineProperty(globalThis, 'fetch', {
    value: async () => ({ ok: true, json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) }),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(prisma, '$queryRaw', {
    value: async (_strings: readonly string[], ...values: unknown[]) => {
      queryRawCalls.push(values);
      return [{ source: 'handbook.pdf', content: 'Matching passage.' }];
    },
    configurable: true,
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { value: realFetch, configurable: true, writable: true });
  });

  beforeEach(() => {
    queryRawCalls = [];
  });

  it('embeds the query and filters by tenantId + the viewer\'s own roles, never a supplied value', async () => {
    const rows = (await tool.execute('t1', viewer('u1', ['HrHead']), { query: 'leave policy' })) as DocumentSearchResultDto[];
    assert.equal(rows[0].source, 'handbook.pdf');
    assert.equal(queryRawCalls[0][0], 't1'); // tenantId
    assert.equal(queryRawCalls[0][1], '{"HrHead"}'); // viewer.roles, never model-supplied
  });
});

describe('queryRoles', () => {
  const tool = SMART_SEARCH_TOOLS.find((t) => t.name === 'queryRoles')!;
  let roleRows: { id: string; name: string; isSystem: boolean; permissions: string[]; archived: boolean; _count: { users: number } }[] = [];

  // Set fresh in beforeEach, not once at the top level: the queryUsers block above also mutates
  // `prisma.role` (its own beforeEach/afterEach), and this file's tests don't run in strict
  // top-to-bottom order, so a one-time top-level assignment here isn't guaranteed to still be
  // there by the time these tests run (verified live — it wasn't).
  beforeEach(() => {
    roleRows = [];
    Object.defineProperty(prisma, 'role', {
      value: {
        findMany: async () => roleRows,
        count: async () => roleRows.length,
      },
      configurable: true,
    });
  });

  it('an Employee (not Enterprise Admin) is denied with HttpError(403)', async () => {
    await assert.rejects(
      () => tool.execute('t1', EMPLOYEE, { search: undefined, archived: undefined }),
      (err: unknown) => err instanceof HttpError && err.status === 403,
    );
  });

  it('an Enterprise Admin gets the role master list', async () => {
    roleRows = [{ id: 'r1', name: 'Tech Lead', isSystem: true, permissions: [], archived: false, _count: { users: 3 } }];
    const admin = viewer('admin1', [SystemRoleKey.EnterpriseAdmin]);
    const rows = (await tool.execute('t1', admin, { search: undefined, archived: undefined })) as RoleDto[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Tech Lead');
    assert.equal(rows[0].memberCount, 3);
  });
});

describe('queryRolesArgsSchema', () => {
  it('normalizes an explicit null (model-supplied unset arg) to undefined', () => {
    const result = queryRolesArgsSchema.parse({ search: null, archived: null });
    assert.equal(result.search, undefined);
    assert.equal(result.archived, undefined);
  });

  it('passes a real boolean archived value through untouched', () => {
    assert.equal(queryRolesArgsSchema.parse({ archived: true }).archived, true);
  });
});

describe('searchDocsArgsSchema', () => {
  it('requires a non-empty query', () => {
    assert.equal(searchDocsArgsSchema.safeParse({ query: '' }).success, false);
    assert.equal(searchDocsArgsSchema.safeParse({}).success, false);
  });

  it('accepts a query string', () => {
    assert.equal(searchDocsArgsSchema.parse({ query: 'leave policy' }).query, 'leave policy');
  });
});
