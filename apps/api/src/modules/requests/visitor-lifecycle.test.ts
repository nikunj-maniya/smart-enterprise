import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { createVisitorRecord, recordVisitorCheckIn, recordVisitorCheckOut } from './visitor-lifecycle.js';

let visitorCreateArgs: Array<{ data: Record<string, unknown> }>;
let visitorUpdateArgs: Array<{ where: unknown; data: Record<string, unknown> }>;

function fakeTx(): Prisma.TransactionClient {
  return {
    visitor: {
      create: async (args: { data: Record<string, unknown> }) => {
        visitorCreateArgs.push(args);
      },
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        visitorUpdateArgs.push(args);
      },
    },
  } as unknown as Prisma.TransactionClient;
}

beforeEach(() => {
  visitorCreateArgs = [];
  visitorUpdateArgs = [];
});

// ── createVisitorRecord ──────────────────────────────────────────────────

test('createVisitorRecord creates a Visitor row scoped to the request with consent recorded true', async () => {
  await createVisitorRecord(fakeTx(), 'req-1', { privacy_consent: true });
  assert.equal(visitorCreateArgs.length, 1);
  assert.deepEqual(visitorCreateArgs[0].data, { requestId: 'req-1', consent: true });
});

test('createVisitorRecord records consent false when privacy_consent is false', async () => {
  await createVisitorRecord(fakeTx(), 'req-2', { privacy_consent: false });
  assert.deepEqual(visitorCreateArgs[0].data, { requestId: 'req-2', consent: false });
});

test('createVisitorRecord treats a missing privacy_consent as false, never trusting a truthy-but-non-boolean value', async () => {
  await createVisitorRecord(fakeTx(), 'req-3', {});
  assert.equal(visitorCreateArgs[0].data.consent, false);
});

test('createVisitorRecord treats a non-boolean truthy privacy_consent (e.g. the string "true") as false', async () => {
  // Only a strict `=== true` counts as consent — a stringly-typed payload value must not slip through.
  await createVisitorRecord(fakeTx(), 'req-4', { privacy_consent: 'true' });
  assert.equal(visitorCreateArgs[0].data.consent, false);
});

// ── recordVisitorCheckIn / recordVisitorCheckOut ────────────────────────────

test('recordVisitorCheckIn stamps checkInAt with the current time, scoped by requestId', async () => {
  const before = Date.now();
  await recordVisitorCheckIn(fakeTx(), 'req-1');
  const after = Date.now();

  assert.equal(visitorUpdateArgs.length, 1);
  assert.deepEqual(visitorUpdateArgs[0].where, { requestId: 'req-1' });
  const checkInAt = visitorUpdateArgs[0].data.checkInAt as Date;
  assert.ok(checkInAt instanceof Date);
  assert.ok(checkInAt.getTime() >= before && checkInAt.getTime() <= after);
});

test('recordVisitorCheckOut stamps checkOutAt with the current time, scoped by requestId', async () => {
  const before = Date.now();
  await recordVisitorCheckOut(fakeTx(), 'req-2');
  const after = Date.now();

  assert.equal(visitorUpdateArgs.length, 1);
  assert.deepEqual(visitorUpdateArgs[0].where, { requestId: 'req-2' });
  const checkOutAt = visitorUpdateArgs[0].data.checkOutAt as Date;
  assert.ok(checkOutAt instanceof Date);
  assert.ok(checkOutAt.getTime() >= before && checkOutAt.getTime() <= after);
});

test('recordVisitorCheckIn and recordVisitorCheckOut only ever touch their own timestamp field', async () => {
  await recordVisitorCheckIn(fakeTx(), 'req-1');
  assert.deepEqual(Object.keys(visitorUpdateArgs[0].data), ['checkInAt']);

  await recordVisitorCheckOut(fakeTx(), 'req-1');
  assert.deepEqual(Object.keys(visitorUpdateArgs[1].data), ['checkOutAt']);
});
