import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import type { CreateRequestInput } from '@se/shared';
import { clearCompileCache } from '@se/shared';
import { prisma } from '../../prisma.js';
import { redisConnection } from '../../lib/redis.js';
import { HttpError } from '../../lib/http-error.js';
import { createRequest, getRequestById, listApprovalQueue, listMyRequests } from './requests.service.js';

// requests.service.js transitively imports the BullMQ `redisConnection` (via
// notifications.service.js -> slack-delivery.js), which connects eagerly (no lazyConnect) and
// retries indefinitely — left alone, that keeps this process alive with no live Redis in CI.
// Silence its connection errors and disconnect immediately so the test run can exit
// (front-desk.routes.test.ts pattern).
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * Stubbed-Prisma unit tests (forms.service.test.ts / notifications.service.test.ts pattern): CI
 * has no live Postgres, so every Prisma delegate that `createRequest`/`getRequestById`/
 * `listMyRequests`/`listApprovalQueue` — and the real `resolveApprovers` / `applySelfApprovalEscalation`
 * / `canViewRequestDetail` they call directly — touch is redefined as an in-memory stub on the
 * shared `prisma` singleton (every module under test imports that same instance).
 *
 * `request_needs_approval` is a *mandatory* notification type (NOTIFICATION_TYPE_CATALOG), so
 * `notifyMany` always fires `mirrorToSlack` once there are approvers — a real, fire-and-forget
 * BullMQ `Queue.add()` against the disconnected connection above. That rejects near-instantly
 * ("Connection is closed.") and is swallowed by `mirrorToSlack`'s own `.catch(() => {})`,
 * verified safe by hand; it is not stubbed further here.
 */

// ── Fixture builders (forms.service.test.ts pattern) ─────────────

type FieldRow = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: unknown;
  validation: unknown;
  visibilityRule: unknown;
};
type PublishedRow = {
  id: string;
  key: string;
  title: string;
  version: number;
  renderer: string;
  status: string;
  sections: Array<{ order: number; title: string; visibilityRule: unknown; fields: FieldRow[] }>;
  approvalWorkflow: { mode: string; stageRules: unknown } | null;
  statusModel: { states: unknown; transitions: unknown } | null;
};

function field(row: Pick<FieldRow, 'key' | 'label' | 'type'> & Partial<FieldRow>): FieldRow {
  return { required: false, options: null, validation: null, visibilityRule: null, ...row };
}

function definition(id: string, key: string, fields: FieldRow[], stageRules?: unknown): PublishedRow {
  return {
    id,
    key,
    title: `${key} form`,
    version: 1,
    renderer: 'core',
    status: 'published',
    sections: [{ order: 0, title: 'Details', visibilityRule: null, fields }],
    approvalWorkflow: stageRules ? { mode: 'parallel', stageRules } : null,
    statusModel: null,
  };
}

function input(formKey: string, payload: Record<string, unknown>): CreateRequestInput {
  return { formKey, payload };
}

// ── Controllable state, reset per test ─────────────

let publishedByKey: PublishedRow | undefined;
let publishedById: PublishedRow | undefined;
let leaveTypeRow: { id: string; isPaid: boolean } | null;
let leaveBalanceRow: { balance: number } | null;
let activeCatalogNames: string[];
let priorSpecialConditionCount: number;
let requesterRow: { name: string } | undefined;
let approverUserRows: Array<{ id: string; name: string }>;
let requestDetailRow: Record<string, unknown> | undefined;
let myRequestsRows: unknown[];
let myRequestsTotal: number;
let approvalQueueRows: unknown[];
let awaitingCountVal: number;
let decidedCountVal: number;
let createdRequestId: string;
let escalationConfig: {
  rule?: { toRoleId: string } | null;
  activeRoleHolderId?: string | null;
  enterpriseAdminId?: string | null;
};

const calls = {
  formDefinitionFindFirst: [] as unknown[],
  requestFindMany: [] as unknown[],
  requestApproverCount: [] as unknown[],
  requestApproverFindMany: [] as unknown[],
  txRequestCreate: [] as unknown[],
  txVisitorCreate: [] as unknown[],
  txRequestApproverCreateMany: [] as unknown[],
  txStatusHistoryCreate: [] as unknown[],
  txAuditLogCreate: [] as unknown[],
  txNotificationCreate: [] as unknown[],
};

beforeEach(() => {
  publishedByKey = undefined;
  publishedById = undefined;
  leaveTypeRow = null;
  leaveBalanceRow = null;
  activeCatalogNames = [];
  priorSpecialConditionCount = 0;
  requesterRow = { name: 'Requester Name' };
  approverUserRows = [];
  requestDetailRow = undefined;
  myRequestsRows = [];
  myRequestsTotal = 0;
  approvalQueueRows = [];
  awaitingCountVal = 0;
  decidedCountVal = 0;
  createdRequestId = 'req-created-1';
  escalationConfig = {};
  for (const key of Object.keys(calls) as (keyof typeof calls)[]) calls[key].length = 0;
  clearCompileCache();
});

function fakeTx(): Prisma.TransactionClient {
  return {
    escalationRule: { findUnique: async () => escalationConfig.rule ?? null },
    userRole: {
      findFirst: async () => (escalationConfig.activeRoleHolderId ? { userId: escalationConfig.activeRoleHolderId } : null),
    },
    user: {
      findFirst: async () => (escalationConfig.enterpriseAdminId ? { id: escalationConfig.enterpriseAdminId } : null),
      findUnique: async () => ({ notificationPreferences: null }),
    },
    request: {
      create: async (args: { data: Record<string, unknown> }) => {
        calls.txRequestCreate.push(args);
        return { ...args.data, id: createdRequestId, createdAt: new Date('2026-01-15T10:00:00.000Z') };
      },
    },
    visitor: {
      create: async (args: unknown) => {
        calls.txVisitorCreate.push(args);
      },
    },
    requestApprover: {
      createMany: async (args: unknown) => {
        calls.txRequestApproverCreateMany.push(args);
      },
    },
    requestStatusHistory: {
      create: async (args: unknown) => {
        calls.txStatusHistoryCreate.push(args);
      },
    },
    auditLog: {
      create: async (args: unknown) => {
        calls.txAuditLogCreate.push(args);
      },
    },
    notification: {
      create: async (args: { data: { type: string; payload: unknown } }) => {
        calls.txNotificationCreate.push(args);
        return { id: 'notif-1', type: args.data.type, payload: args.data.payload, read: false, createdAt: new Date() };
      },
    },
  } as unknown as Prisma.TransactionClient;
}

Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => fn(fakeTx()),
  configurable: true,
});

Object.defineProperty(prisma, 'formDefinition', {
  value: {
    findFirst: async (args: { where: Record<string, unknown> }) => {
      calls.formDefinitionFindFirst.push(args);
      // findPublished (createRequest) filters by `status`; getDefinitionById (getRequestById) doesn't.
      return 'status' in args.where ? (publishedByKey ?? null) : (publishedById ?? null);
    },
  },
  configurable: true,
});

Object.defineProperty(prisma, 'leaveType', {
  value: { findFirst: async () => leaveTypeRow },
  configurable: true,
});

Object.defineProperty(prisma, 'leaveBalance', {
  value: { findUnique: async () => leaveBalanceRow },
  configurable: true,
});

Object.defineProperty(prisma, 'itemCatalog', {
  value: { findMany: async () => activeCatalogNames.map((name) => ({ name })) },
  configurable: true,
});

Object.defineProperty(prisma, 'user', {
  value: {
    findUniqueOrThrow: async () => requesterRow ?? { name: 'Unknown' },
    findMany: async () => approverUserRows,
  },
  configurable: true,
});

Object.defineProperty(prisma, 'request', {
  value: {
    // computeSpecialConditionFlag's count has a `payload` key; listMyRequests' doesn't.
    count: async (args: { where: Record<string, unknown> }) => ('payload' in args.where ? priorSpecialConditionCount : myRequestsTotal),
    findFirst: async () => requestDetailRow ?? null,
    findMany: async (args: unknown) => {
      calls.requestFindMany.push(args);
      return myRequestsRows;
    },
  },
  configurable: true,
});

Object.defineProperty(prisma, 'requestApprover', {
  value: {
    count: async (args: { where: { decision?: string } }) => {
      calls.requestApproverCount.push(args);
      return args.where.decision === 'pending' ? awaitingCountVal : decidedCountVal;
    },
    findMany: async (args: unknown) => {
      calls.requestApproverFindMany.push(args);
      return approvalQueueRows;
    },
  },
  configurable: true,
});

// ── createRequest ─────────────

describe('createRequest', () => {
  it('throws 404 when the form has no published version', async () => {
    publishedByKey = undefined;
    await assert.rejects(
      () => createRequest('t1', 'req-1', input('ghost-form', {})),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 404);
        return true;
      },
    );
  });

  it('throws 400 with field errors when the payload fails validation', async () => {
    publishedByKey = definition('def-onboarding', 'onboarding', [
      field({ key: 'note', label: 'Note', type: 'textarea', required: true }),
    ]);
    await assert.rejects(
      () => createRequest('t1', 'req-1', input('onboarding', {})),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.equal(err.message, 'Validation failed');
        assert.ok((err.details as Record<string, string[]>).note);
        return true;
      },
    );
    assert.equal(calls.txRequestCreate.length, 0);
  });

  it('rejects an IT request naming a retired catalog item (400) before touching the transaction', async () => {
    publishedByKey = definition('def-it', 'it', [
      field({ key: 'software_items', label: 'Software', type: 'multi-select', required: false }),
    ]);
    activeCatalogNames = []; // nothing active
    await assert.rejects(
      () => createRequest('t1', 'req-1', input('it', { software_items: ['Retired App'] })),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.match(err.message, /Retired App/);
        return true;
      },
    );
    assert.equal(calls.txRequestCreate.length, 0);
  });

  it('rejects half-day dates that fall outside the leave date range (400) before touching the transaction', async () => {
    publishedByKey = definition('def-leave', 'leave', [
      field({ key: 'start_date', label: 'Start', type: 'date', required: true }),
      field({ key: 'end_date', label: 'End', type: 'date', required: true }),
      field({ key: 'half_day_dates', label: 'Half days', type: 'date-multi', required: false }),
    ]);
    await assert.rejects(
      () =>
        createRequest(
          't1',
          'req-1',
          input('leave', { start_date: '2026-03-01', end_date: '2026-03-05', half_day_dates: ['2026-03-10'] }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.match(err.message, /Half-day dates must fall within/);
        return true;
      },
    );
    assert.equal(calls.txRequestCreate.length, 0);
  });

  it('rejects a >2-day WFH request with no HR Head approval stage (400, thrown inside the transaction)', async () => {
    publishedByKey = definition(
      'def-wfh',
      'wfh',
      [
        field({ key: 'start_date', label: 'Start', type: 'date', required: true }),
        field({ key: 'end_date', label: 'End', type: 'date', required: true }),
        field({ key: 'techLead', label: 'Tech Lead', type: 'user-picker', required: true, options: { roles: ['tech-lead'] } }),
      ],
      { approvers: [{ source: 'field', field: 'techLead' }] },
    );
    approverUserRows = [{ id: 'tech-lead-user', name: 'Tech Lead' }];
    await assert.rejects(
      () =>
        createRequest(
          't1',
          'req-1',
          input('wfh', { start_date: '2026-04-01', end_date: '2026-04-10', techLead: 'tech-lead-user' }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.match(err.message, /HR Head sign-off/);
        return true;
      },
    );
    // The guard fires inside the transaction, after the (unwritten) approver snapshot resolves.
    assert.equal(calls.txRequestApproverCreateMany.length, 0);
  });

  it('creates a generic-form request with no approval stage: no approver snapshot, no notification fan-out', async () => {
    publishedByKey = definition('def-onboarding', 'onboarding', [
      field({ key: 'note', label: 'Note', type: 'textarea', required: true }),
    ]);

    const dto = await createRequest('t1', 'req-1', input('onboarding', { note: 'hello' }));

    assert.deepEqual(dto, {
      id: 'req-created-1',
      formKey: 'onboarding',
      status: 'Submitted',
      createdAt: '2026-01-15T10:00:00.000Z',
    });
    assert.equal(calls.txRequestCreate.length, 1);
    const created = calls.txRequestCreate[0] as { data: Record<string, unknown> };
    assert.equal(created.data.tenantId, 't1');
    assert.equal(created.data.formDefinitionId, 'def-onboarding');
    assert.equal(created.data.formVersion, 1);
    assert.equal(created.data.requesterId, 'req-1');
    assert.equal(created.data.status, 'Submitted');
    assert.deepEqual(created.data.payload, { note: 'hello' });
    assert.equal(created.data.overBalance, null);
    assert.equal(created.data.specialConditionFlagged, null);
    // No approval workflow → no approvers → neither the snapshot nor the notification fan-out fires.
    assert.equal(calls.txRequestApproverCreateMany.length, 0);
    assert.equal(calls.txNotificationCreate.length, 0);
    assert.equal(calls.txVisitorCreate.length, 0);
    assert.equal(calls.txStatusHistoryCreate.length, 1);
    assert.deepEqual(calls.txStatusHistoryCreate[0], {
      data: { requestId: 'req-created-1', fromState: null, toState: 'Submitted', actorId: 'req-1' },
    });
    assert.equal(calls.txAuditLogCreate.length, 1);
  });

  it('creates a leave request: promotes columns, flags over-balance, and snapshots a two-stage approval chain', async () => {
    publishedByKey = definition(
      'def-leave',
      'leave',
      [
        field({ key: 'start_date', label: 'Start', type: 'date', required: true }),
        field({ key: 'end_date', label: 'End', type: 'date', required: true }),
        field({ key: 'number_of_days', label: 'Days', type: 'number', required: true }),
        field({ key: 'leave_type', label: 'Type', type: 'single-select', required: true }),
        field({ key: 'techLead', label: 'Tech Lead', type: 'user-picker', required: true, options: { roles: ['tech-lead'] } }),
        field({ key: 'hrHead', label: 'HR Head', type: 'user-picker', required: true, options: { roles: ['hr-head'] } }),
      ],
      { approvers: [{ source: 'field', field: 'techLead' }, { source: 'field', field: 'hrHead' }] },
    );
    leaveTypeRow = { id: 'lt1', isPaid: true };
    leaveBalanceRow = { balance: 2 }; // < the 5 days requested → over-balance
    approverUserRows = [
      { id: 'tech-lead-user', name: 'Tech Lead' },
      { id: 'hr-head-user', name: 'HR Head' },
    ];

    const dto = await createRequest(
      't1',
      'req-1',
      input('leave', {
        start_date: '2026-02-01',
        end_date: '2026-02-05',
        number_of_days: 5,
        leave_type: 'Casual Leave',
        techLead: 'tech-lead-user',
        hrHead: 'hr-head-user',
      }),
    );

    assert.equal(dto.status, 'Submitted');
    const created = calls.txRequestCreate[0] as { data: Record<string, unknown> };
    assert.equal(created.data.totalDays, 5);
    assert.equal(created.data.leaveTypeId, 'Casual Leave');
    assert.equal(created.data.overBalance, true);
    assert.ok(created.data.startDate instanceof Date);
    assert.ok(created.data.endDate instanceof Date);

    assert.equal(calls.txRequestApproverCreateMany.length, 1);
    const approverArgs = calls.txRequestApproverCreateMany[0] as { data: Array<Record<string, unknown>> };
    assert.deepEqual(approverArgs.data, [
      { requestId: 'req-created-1', approverId: 'tech-lead-user', roleContext: 'tech-lead', decision: 'pending' },
      { requestId: 'req-created-1', approverId: 'hr-head-user', roleContext: 'hr-head', decision: 'pending' },
    ]);
  });

  it('flags specialConditionFlagged on a repeat WFH special-condition claim', async () => {
    publishedByKey = definition('def-wfh', 'wfh', [
      field({ key: 'start_date', label: 'Start', type: 'date', required: true }),
      field({ key: 'end_date', label: 'End', type: 'date', required: true }),
      field({ key: 'special_condition', label: 'Special condition', type: 'single-select', required: false }),
    ]);
    priorSpecialConditionCount = 1; // a prior claim already exists

    await createRequest(
      't1',
      'req-1',
      input('wfh', { start_date: '2026-05-01', end_date: '2026-05-02', special_condition: 'Yes' }),
    );

    const created = calls.txRequestCreate[0] as { data: Record<string, unknown> };
    assert.equal(created.data.specialConditionFlagged, true);
  });

  it('creates the 1:1 Visitor record for a visitor-form submission', async () => {
    publishedByKey = definition('def-visitor', 'visitor', [
      field({ key: 'privacy_consent', label: 'Consent', type: 'consent-link', required: true }),
    ]);

    await createRequest('t1', 'req-1', input('visitor', { privacy_consent: true }));

    assert.equal(calls.txVisitorCreate.length, 1);
    const visitorArgs = calls.txVisitorCreate[0] as { data: { requestId: string; consent: boolean } };
    assert.equal(visitorArgs.data.requestId, 'req-created-1');
    assert.equal(visitorArgs.data.consent, true);
  });

  it('escalates a self-resolved approver before writing the snapshot (no self-approval)', async () => {
    publishedByKey = definition(
      'def-onboarding',
      'onboarding',
      [field({ key: 'techLead', label: 'Tech Lead', type: 'user-picker', required: true, options: { roles: ['tech-lead'] } })],
      { approvers: [{ source: 'field', field: 'techLead' }] },
    );
    escalationConfig = { rule: { toRoleId: 'role-hr-head' }, activeRoleHolderId: 'hr-head-user' };
    // The requester genuinely holds the tech-lead role themself (that's why self-approval
    // escalation is needed at all — an ineligible id would be rejected before escalation runs).
    approverUserRows = [{ id: 'req-1', name: 'Requester' }];

    // The requester names themself as the tech-lead approver.
    await createRequest('t1', 'req-1', input('onboarding', { techLead: 'req-1' }));

    assert.equal(calls.txRequestApproverCreateMany.length, 1);
    const approverArgs = calls.txRequestApproverCreateMany[0] as { data: Array<Record<string, unknown>> };
    assert.deepEqual(approverArgs.data, [
      { requestId: 'req-created-1', approverId: 'hr-head-user', roleContext: 'tech-lead', decision: 'pending' },
    ]);
  });
});

// ── getRequestById ─────────────

describe('getRequestById', () => {
  const BASE_ROW = {
    id: 'req-1',
    tenantId: 't1',
    formDefinitionId: 'def-1',
    requesterId: 'requester-1',
    status: 'Pending Approval',
    payload: { note: 'hi' },
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    startDate: null,
    endDate: null,
    overBalance: null,
    specialConditionFlagged: null,
    form: { key: 'onboarding', title: 'Onboarding Form' },
    approvers: [
      {
        approverId: 'approver-1',
        roleContext: 'tech-lead',
        decision: null,
        comment: null,
        escalatedFromId: null,
        escalationCause: null,
      },
      {
        approverId: 'approver-2',
        roleContext: 'hr-head',
        decision: 'approved',
        comment: 'ok',
        escalatedFromId: 'orig-approver',
        escalationCause: 'timeout',
      },
    ],
  };

  beforeEach(() => {
    requestDetailRow = structuredClone(BASE_ROW) as unknown as Record<string, unknown>;
    publishedById = definition('def-1', 'onboarding', [field({ key: 'note', label: 'Note', type: 'textarea' })]);
    approverUserRows = [
      { id: 'approver-1', name: 'Alice' },
      { id: 'approver-2', name: 'Bob' },
      { id: 'orig-approver', name: 'Carol' },
    ];
  });

  it('throws 404 when the request does not exist (or belongs to another tenant)', async () => {
    requestDetailRow = undefined;
    await assert.rejects(
      () => getRequestById('t1', 'requester-1', 'missing'),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 404);
        return true;
      },
    );
  });

  it('throws 404 for a viewer who is neither the requester nor a snapshotted approver', async () => {
    await assert.rejects(
      () => getRequestById('t1', 'random-employee', 'req-1'),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 404);
        return true;
      },
    );
  });

  it('returns full detail for the requester, defaulting a null decision to pending', async () => {
    const dto = await getRequestById('t1', 'requester-1', 'req-1');
    assert.equal(dto.requesterId, 'requester-1');
    assert.equal(dto.approvers[0].decision, 'pending');
    assert.equal(dto.approvers[0].approverName, 'Alice');
  });

  it('returns full detail for a snapshotted approver, including escalation chain annotations', async () => {
    const dto = await getRequestById('t1', 'approver-2', 'req-1');
    assert.equal(dto.approvers[1].decision, 'approved');
    assert.equal(dto.approvers[1].escalatedFromName, 'Carol');
    assert.equal(dto.approvers[1].escalationCause, 'timeout');
  });

  it("falls back to 'Unknown' for an approver id absent from the resolved user set", async () => {
    approverUserRows = [];
    const dto = await getRequestById('t1', 'requester-1', 'req-1');
    assert.equal(dto.approvers[0].approverName, 'Unknown');
    assert.equal(dto.approvers[1].escalatedFromName, 'Unknown');
  });
});

// ── listMyRequests ─────────────

describe('listMyRequests', () => {
  beforeEach(() => {
    myRequestsRows = [
      {
        id: 'r1',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        startDate: null,
        endDate: null,
        status: 'Approved',
        form: { key: 'leave', title: 'Leave Request' },
        approvers: [{ decision: 'approved' }, { decision: null }],
      },
    ];
    myRequestsTotal = 42; // deliberately != rows.length, to prove `total` comes from the count query
  });

  it('scopes to the caller\'s own tenant+requesterId with no status filter by default', async () => {
    const dto = await listMyRequests('t1', 'u1', { page: 1, pageSize: 20 });
    const args = calls.requestFindMany[0] as { where: Record<string, unknown>; skip: number; take: number; orderBy: unknown };
    assert.deepEqual(args.where, { tenantId: 't1', requesterId: 'u1' });
    assert.equal(args.skip, 0);
    assert.equal(args.take, 20);
    assert.deepEqual(args.orderBy, { createdAt: 'desc' });
    assert.equal(dto.total, 42);
  });

  it('adds the status filter when provided', async () => {
    await listMyRequests('t1', 'u1', { page: 1, pageSize: 20, status: 'Approved' });
    const args = calls.requestFindMany[0] as { where: Record<string, unknown> };
    assert.deepEqual(args.where, { tenantId: 't1', requesterId: 'u1', status: 'Approved' });
  });

  it('paginates with skip/take derived from page/pageSize', async () => {
    await listMyRequests('t1', 'u1', { page: 3, pageSize: 5 });
    const args = calls.requestFindMany[0] as { skip: number; take: number };
    assert.equal(args.skip, 10);
    assert.equal(args.take, 5);
  });

  it('counts a pending approver row as not-decided when computing approversTotal/approversDecided', async () => {
    const dto = await listMyRequests('t1', 'u1', { page: 1, pageSize: 20 });
    assert.equal(dto.rows[0].approversTotal, 2);
    assert.equal(dto.rows[0].approversDecided, 1); // the null-decision row is still pending
  });
});

// ── listApprovalQueue ─────────────

describe('listApprovalQueue', () => {
  beforeEach(() => {
    approvalQueueRows = [
      {
        decision: 'pending',
        request: {
          id: 'req-9',
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          status: 'Pending Approval',
          startDate: null,
          endDate: null,
          overBalance: null,
          specialConditionFlagged: null,
          form: { key: 'leave', title: 'Leave Request' },
          requester: { id: 'requester-9', name: 'Dee', jobTitle: 'Engineer' },
          approvers: [
            { approverId: 'me', roleContext: 'tech-lead', decision: 'pending', comment: null, escalatedFromId: null, escalationCause: null },
            {
              approverId: 'peer',
              roleContext: 'hr-head',
              decision: null,
              comment: null,
              escalatedFromId: 'orig',
              escalationCause: 'on_leave',
            },
          ],
        },
      },
    ];
    approverUserRows = [
      { id: 'me', name: 'Me' },
      { id: 'peer', name: 'Peer' },
      // 'orig' deliberately absent → exercises the 'Unknown' fallback.
    ];
    awaitingCountVal = 3;
    decidedCountVal = 7;
  });

  it('uses the pending decision filter for the default (pending) tab', async () => {
    const dto = await listApprovalQueue('t1', 'me', { tab: 'pending' });
    const findManyArgs = calls.requestApproverFindMany[0] as { where: { decision?: string } };
    assert.equal(findManyArgs.where.decision, 'pending');
    assert.equal(dto.awaitingCount, 3);
    assert.equal(dto.decidedCount, 7);
  });

  it("uses a NOT-pending filter for the 'decided' tab, still scoped to the caller's tenant", async () => {
    await listApprovalQueue('t1', 'me', { tab: 'decided' });
    const findManyArgs = calls.requestApproverFindMany[0] as { where: Record<string, unknown> };
    assert.deepEqual(findManyArgs.where.NOT, { decision: 'pending' });
    // Unlike the pending-tab path, the decided path's `request` scope is never overwritten by
    // `stillAwaitable`, so tenantId scoping survives here.
    assert.deepEqual(findManyArgs.where.request, { tenantId: 't1' });
  });

  it('filters by roleContext when the caller holds more than one approver role', async () => {
    await listApprovalQueue('t1', 'me', { tab: 'pending', roleContext: 'tech-lead' });
    const findManyArgs = calls.requestApproverFindMany[0] as { where: { roleContext?: string } };
    assert.equal(findManyArgs.where.roleContext, 'tech-lead');
    const countArgs = calls.requestApproverCount[0] as { where: { roleContext?: string } };
    assert.equal(countArgs.where.roleContext, 'tech-lead');
  });

  it("maps each row's own decision to myDecision, defaulting null to pending", async () => {
    const dto = await listApprovalQueue('t1', 'me', { tab: 'pending' });
    assert.equal(dto.rows[0].myDecision, 'pending');
  });

  it("resolves the approval chain, defaulting an unresolved approver's name to 'Unknown'", async () => {
    const dto = await listApprovalQueue('t1', 'me', { tab: 'pending' });
    const chain = dto.rows[0].chain;
    assert.equal(chain[0].approverName, 'Me');
    assert.equal(chain[1].approverName, 'Peer');
    assert.equal(chain[1].escalatedFromName, 'Unknown');
    assert.equal(chain[1].escalationCause, 'on_leave');
  });
});
