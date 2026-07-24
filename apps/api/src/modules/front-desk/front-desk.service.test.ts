import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { redisConnection } from '../../lib/redis.js';
import { checkInWithSignature, getSignatureUrl, getTodayView } from './front-desk.service.js';

// front-desk.service.js transitively imports the BullMQ `redisConnection` (via
// transitions.service.js -> notifications.service.js -> slack-delivery.js), which connects
// eagerly (no lazyConnect) and retries indefinitely — left alone, that keeps this process alive
// with no live Redis in CI. Silence its connection errors and disconnect immediately so the test
// run can exit.
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * Stubbed-Prisma suite (forms.service.test.ts pattern). Only the pure, pre-DB-write paths run
 * here: `getTodayView`'s read-and-categorize logic, and the guard clauses of
 * `checkInWithSignature`/`getSignatureUrl` that reject before any object-storage or
 * `transitionRequest` call. The full check-in flow (signature upload to MinIO, driving the
 * Approved -> Checked-In transition) needs a live DB/MinIO and is left to the scripted
 * verification pass.
 */

let requestRows: unknown[] = [];
let userRows: { id: string; name: string }[] = [];
let visitorRow: { signatureObjectKey: string | null } | null = null;
const calls = { requestFindMany: [] as unknown[], userFindMany: [] as unknown[], visitorFindFirst: [] as unknown[] };

Object.defineProperty(prisma, 'request', {
  value: {
    findMany: async (args: unknown) => {
      calls.requestFindMany.push(args);
      return requestRows;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: {
    findMany: async (args: unknown) => {
      calls.userFindMany.push(args);
      return userRows;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'visitor', {
  value: {
    findFirst: async (args: unknown) => {
      calls.visitorFindFirst.push(args);
      return visitorRow;
    },
  },
  configurable: true,
});

beforeEach(() => {
  requestRows = [];
  userRows = [];
  visitorRow = null;
  calls.requestFindMany.length = 0;
  calls.userFindMany.length = 0;
  calls.visitorFindFirst.length = 0;
});

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    status: 'Approved',
    startDate: new Date('2026-07-22T04:00:00.000Z'),
    payload: {
      visitor_name: 'Alice',
      mobile: '9999999999',
      purpose: 'Meeting',
      whom_to_meet: 'u1',
    },
    visitor: null,
    ...overrides,
  };
}

describe('getTodayView', () => {
  it('queries only requests for today, on the visitor form', async () => {
    await getTodayView('t1');

    const args = calls.requestFindMany[0] as {
      where: { tenantId: string; form: { key: string }; startDate: { gte: Date; lt: Date } };
    };
    assert.equal(args.where.tenantId, 't1');
    assert.deepEqual(args.where.form, { key: 'visitor' });
    assert.ok(args.where.startDate.gte instanceof Date);
    assert.ok(args.where.startDate.lt instanceof Date);
    // The range is exactly one calendar day (todayRangeIST's start/end).
    assert.equal(args.where.startDate.lt.getTime() - args.where.startDate.gte.getTime(), 24 * 60 * 60 * 1000);
  });

  it('categorizes approved-not-checked-in as expected, checked-in-not-out as on-site, checked-out as checked-out', async () => {
    requestRows = [
      requestRow({ id: 'r-expected', status: 'Approved', visitor: null }),
      requestRow({ id: 'r-onsite', status: 'Checked-In', visitor: { checkInAt: new Date(), checkOutAt: null } }),
      requestRow({
        id: 'r-done',
        status: 'Checked-Out',
        visitor: { checkInAt: new Date(), checkOutAt: new Date() },
      }),
    ];
    userRows = [{ id: 'u1', name: 'Bob' }];

    const res = await getTodayView('t1');

    assert.deepEqual(res.expected.map((d) => d.requestId), ['r-expected']);
    assert.deepEqual(res.onSite.map((d) => d.requestId), ['r-onsite']);
    assert.deepEqual(res.checkedOut.map((d) => d.requestId), ['r-done']);
  });

  it('resolves the host name from whom_to_meet, falling back to Unknown', async () => {
    requestRows = [
      requestRow({ id: 'r-known', payload: { ...requestRow().payload, whom_to_meet: 'u1' } }),
      requestRow({ id: 'r-unknown', payload: { ...requestRow().payload, whom_to_meet: 'ghost' } }),
      requestRow({ id: 'r-none', payload: { ...requestRow().payload, whom_to_meet: undefined } }),
    ];
    userRows = [{ id: 'u1', name: 'Bob' }];

    const res = await getTodayView('t1');
    const byId = new Map(res.expected.map((d) => [d.requestId, d.hostName]));
    assert.equal(byId.get('r-known'), 'Bob');
    assert.equal(byId.get('r-unknown'), 'Unknown');
    assert.equal(byId.get('r-none'), 'Unknown');
    // Every distinct string whom_to_meet value is looked up (even one with no matching user row) — deduped.
    assert.deepEqual((calls.userFindMany[0] as { where: { id: { in: string[] } } }).where.id.in, ['u1', 'ghost']);
  });

  it('tolerates a malformed payload — non-string fields fall back to empty strings, not a throw', async () => {
    requestRows = [requestRow({ payload: { visitor_name: 42, mobile: null, purpose: undefined } })];

    const res = await getTodayView('t1');

    assert.equal(res.expected[0].visitorName, '');
    assert.equal(res.expected[0].mobile, '');
    assert.equal(res.expected[0].purpose, '');
  });
});

describe('checkInWithSignature', () => {
  it('rejects a signature that is not a base64 image data URL, before any storage/DB write (400)', async () => {
    await assert.rejects(
      checkInWithSignature('t1', { id: 'actor1', roles: [] }, 'r1', { signature: 'not-a-data-url', consent: true }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.equal(err.message, 'Signature must be a base64 image data URL');
        return true;
      },
    );
  });

  it('rejects a non-image data URL (e.g. text/plain), before any storage/DB write (400)', async () => {
    await assert.rejects(
      checkInWithSignature('t1', { id: 'actor1', roles: [] }, 'r1', {
        signature: 'data:text/plain;base64,AAAA',
        consent: true,
      }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    );
  });
});

describe('getSignatureUrl', () => {
  it('throws 404 when the visitor has no signature on file (no row found)', async () => {
    visitorRow = null;
    await assert.rejects(
      getSignatureUrl('t1', 'r1'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('throws 404 when the visitor row exists but signatureObjectKey is null', async () => {
    visitorRow = { signatureObjectKey: null };
    await assert.rejects(
      getSignatureUrl('t1', 'r1'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
    assert.deepEqual(calls.visitorFindFirst[0], {
      where: { requestId: 'r1', request: { tenantId: 't1' } },
      select: { signatureObjectKey: true },
    });
  });
});
