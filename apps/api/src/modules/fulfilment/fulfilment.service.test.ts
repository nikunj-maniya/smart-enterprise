import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { claimRequest, getFulfilmentQueue } from './fulfilment.service.js';

/**
 * Stubbed-Prisma unit tests (forms.service.test.ts pattern): CI has no live Postgres, so the
 * `request` and `user` delegates are redefined as in-memory stubs, plus `$transaction` runs the
 * callback against a stub `tx`.
 */

type RequestRow = {
  id: string;
  tenantId: string;
  status: string;
  itAssigneeId: string | null;
  requester?: { name: string };
  departmentId?: string | null;
  payload?: Record<string, unknown>;
  statusHistory?: { toState: string; at: Date }[];
  createdAt?: Date;
};

let findFirstRow: RequestRow | null = null;
let findManyRows: RequestRow[] = [];
let updateManyCount = 1;
let userRows: { id: string; name: string }[] = [];
const auditLogs: unknown[] = [];
const countCalls: unknown[] = [];
const updateManyArgs: unknown[] = [];

Object.defineProperty(prisma, 'request', {
  value: {
    findFirst: async () => findFirstRow,
    findMany: async () => findManyRows,
    count: async (args: { where: { status: string } }) => {
      countCalls.push(args);
      return findManyRows.filter((r) => r.status === args.where.status).length;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: { findMany: async () => userRows },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      request: {
        updateMany: async (args: unknown) => {
          updateManyArgs.push(args);
          return { count: updateManyCount };
        },
      },
      auditLog: { create: async ({ data }: { data: unknown }) => void auditLogs.push(data) },
    }),
  configurable: true,
});

beforeEach(() => {
  findFirstRow = null;
  findManyRows = [];
  updateManyCount = 1;
  userRows = [];
  auditLogs.length = 0;
  countCalls.length = 0;
  updateManyArgs.length = 0;
});

describe('claimRequest', () => {
  it('rejects an unknown request with 404', async () => {
    await assert.rejects(
      claimRequest('t1', 'admin-1', 'missing'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('rejects a request that is neither Approved nor In Progress with 409', async () => {
    findFirstRow = { id: 'r1', tenantId: 't1', status: 'Pending', itAssigneeId: null };
    await assert.rejects(
      claimRequest('t1', 'admin-1', 'r1'),
      (err: unknown) => err instanceof HttpError && err.status === 409,
    );
  });

  it('claims an Approved, unassigned request and audit-logs the assignment', async () => {
    findFirstRow = { id: 'r1', tenantId: 't1', status: 'Approved', itAssigneeId: null };

    await claimRequest('t1', 'admin-1', 'r1');

    assert.deepEqual(updateManyArgs, [{ where: { id: 'r1', itAssigneeId: null }, data: { itAssigneeId: 'admin-1' } }]);
    assert.deepEqual(auditLogs, [
      {
        tenantId: 't1',
        actorId: 'admin-1',
        entity: 'Request',
        entityId: 'r1',
        action: 'claim',
        before: { itAssigneeId: null },
        after: { itAssigneeId: 'admin-1' },
      },
    ]);
  });

  it('allows re-claiming an In Progress request already assigned to the same admin', async () => {
    findFirstRow = { id: 'r1', tenantId: 't1', status: 'In Progress', itAssigneeId: 'admin-1' };
    await claimRequest('t1', 'admin-1', 'r1');
    assert.deepEqual(updateManyArgs, [{ where: { id: 'r1', itAssigneeId: 'admin-1' }, data: { itAssigneeId: 'admin-1' } }]);
  });

  it('rejects with 409 when another admin claimed it first (guarded update matched zero rows)', async () => {
    findFirstRow = { id: 'r1', tenantId: 't1', status: 'Approved', itAssigneeId: null };
    updateManyCount = 0;

    await assert.rejects(
      claimRequest('t1', 'admin-1', 'r1'),
      (err: unknown) => err instanceof HttpError && err.status === 409,
    );
    assert.equal(auditLogs.length, 0);
  });
});

describe('getFulfilmentQueue', () => {
  it('the "open" tab filters to Approved/In Progress requests', async () => {
    findManyRows = [
      { id: 'r1', tenantId: 't1', status: 'Approved', itAssigneeId: null, requester: { name: 'Asha' }, departmentId: 'd1', payload: {}, statusHistory: [] },
    ];

    const result = await getFulfilmentQueue('t1', 'open');

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].status, 'Approved');
  });

  it('the "fulfilled" tab filters to Fulfilled requests and reports the three stat counts', async () => {
    findManyRows = [
      { id: 'r1', tenantId: 't1', status: 'Approved', itAssigneeId: null, requester: { name: 'A' }, departmentId: null, payload: {}, statusHistory: [] },
      { id: 'r2', tenantId: 't1', status: 'In Progress', itAssigneeId: null, requester: { name: 'B' }, departmentId: null, payload: {}, statusHistory: [] },
      { id: 'r3', tenantId: 't1', status: 'Fulfilled', itAssigneeId: null, requester: { name: 'C' }, departmentId: null, payload: {}, statusHistory: [] },
    ];

    const result = await getFulfilmentQueue('t1', 'fulfilled');

    assert.equal(result.queuedCount, 1);
    assert.equal(result.inProgressCount, 1);
    assert.equal(result.fulfilledCount, 1);
  });

  it('maps Software access_type to software_items, sw_impact, and the assignee name', async () => {
    userRows = [{ id: 'admin-1', name: 'Priya' }];
    findManyRows = [
      {
        id: 'r1',
        tenantId: 't1',
        status: 'Approved',
        itAssigneeId: 'admin-1',
        requester: { name: 'Asha' },
        departmentId: 'd1',
        payload: { access_type: 'Software', software_items: ['Figma', 'Slack'], sw_impact: 'High' },
        statusHistory: [{ toState: 'Approved', at: new Date('2026-06-01T00:00:00.000Z') }],
      },
    ];

    const result = await getFulfilmentQueue('t1', 'open');
    const row = result.rows[0];

    assert.equal(row.category, 'Software');
    assert.deepEqual(row.items, ['Figma', 'Slack']);
    assert.equal(row.impact, 'High');
    assert.equal(row.assigneeName, 'Priya');
    assert.equal(row.approvedAt, '2026-06-01T00:00:00.000Z');
    assert.equal(row.fulfilledAt, null);
  });

  it('maps Hardware access_type to hardware_items and hw_impact', async () => {
    findManyRows = [
      {
        id: 'r1',
        tenantId: 't1',
        status: 'Approved',
        itAssigneeId: null,
        requester: { name: 'Asha' },
        departmentId: null,
        payload: { access_type: 'Hardware', hardware_items: ['Laptop'], hw_impact: 'Low' },
        statusHistory: [],
      },
    ];

    const row = (await getFulfilmentQueue('t1', 'open')).rows[0];

    assert.equal(row.category, 'Hardware');
    assert.deepEqual(row.items, ['Laptop']);
    assert.equal(row.impact, 'Low');
    assert.equal(row.assigneeId, null);
    assert.equal(row.assigneeName, null);
  });

  it('falls back to "Unknown" category and empty items when access_type is missing', async () => {
    findManyRows = [
      {
        id: 'r1',
        tenantId: 't1',
        status: 'Approved',
        itAssigneeId: null,
        requester: { name: 'Asha' },
        departmentId: null,
        payload: {},
        statusHistory: [],
      },
    ];

    const row = (await getFulfilmentQueue('t1', 'open')).rows[0];

    assert.equal(row.category, 'Unknown');
    assert.deepEqual(row.items, []);
    assert.equal(row.impact, null);
  });

  it('falls back to "Unknown" assignee name when the assignee row cannot be resolved', async () => {
    userRows = [];
    findManyRows = [
      {
        id: 'r1',
        tenantId: 't1',
        status: 'Fulfilled',
        itAssigneeId: 'deleted-admin',
        requester: { name: 'Asha' },
        departmentId: null,
        payload: {},
        statusHistory: [{ toState: 'Fulfilled', at: new Date('2026-06-05T00:00:00.000Z') }],
      },
    ];

    const row = (await getFulfilmentQueue('t1', 'fulfilled')).rows[0];

    assert.equal(row.assigneeName, 'Unknown');
    assert.equal(row.fulfilledAt, '2026-06-05T00:00:00.000Z');
  });
});
