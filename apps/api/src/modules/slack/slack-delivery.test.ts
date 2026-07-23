import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Queue } from 'bullmq';
import { prisma } from '../../prisma.js';
import { redisConnection } from '../../lib/redis.js';
import { encryptSecret } from '../../lib/crypto.js';
import { mirrorToSlack, deliverToSlack, type SlackDeliveryJobData } from './slack-delivery.js';

// slack-delivery.ts imports the BullMQ `redisConnection` eagerly (front-desk.routes.test.ts
// pattern) — silence connection errors and disconnect immediately so the test run can exit with
// no live Redis in CI.
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * `mirrorToSlack` enqueues via a real `bullmq.Queue` — stubbed at `Queue.prototype.add`
 * (object-storage.test.ts pattern: the same technique used for the Minio client) so no real Redis
 * round-trip is needed. `deliverToSlack`'s own Prisma reads are stubbed per forms.service.test.ts,
 * and its Slack calls (via slack-client.ts) go through a stubbed `fetch`.
 */
process.env.SLACK_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

let addCalls: Array<{ name: string; data: unknown; opts: unknown }>;
let addShouldThrow: boolean;

Object.defineProperty(Queue.prototype, 'add', {
  value: async function (name: string, data: unknown, opts: unknown) {
    addCalls.push({ name, data, opts });
    if (addShouldThrow) throw new Error('redis unreachable');
  },
  configurable: true,
});

type ConfigRow = {
  id: string;
  tenantId: string;
  status: string;
  botTokenEncrypted: string | null;
  notifyApproversOnNewRequest: boolean;
  notifyRequesterOnDecision: boolean;
  notifyRequesterOnStatusChange: boolean;
  reminderEnabled: boolean;
};

function configRow(overrides: Partial<ConfigRow> = {}): ConfigRow {
  return {
    id: 'sc1',
    tenantId: 't1',
    status: 'connected',
    botTokenEncrypted: encryptSecret('xoxb-token'),
    notifyApproversOnNewRequest: true,
    notifyRequesterOnDecision: true,
    notifyRequesterOnStatusChange: true,
    reminderEnabled: true,
    ...overrides,
  };
}

let config: ConfigRow | null;
let userRow: { email: string; status: string } | null;
let fetchCalls: Array<{ url: string; body: Record<string, unknown> }>;
let fetchOverride: Partial<Record<'users.lookupByEmail' | 'chat.postMessage', { ok: boolean; [key: string]: unknown }>>;

Object.defineProperty(prisma, 'slackConfig', {
  value: { findUnique: async () => config },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: { findUnique: async () => userRow },
  configurable: true,
});
Object.defineProperty(globalThis, 'fetch', {
  value: async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    fetchCalls.push({ url: String(url), body });
    const method = String(url).split('/').pop() as 'users.lookupByEmail' | 'chat.postMessage';
    return { json: async () => fetchOverride[method] ?? { ok: true } };
  },
  configurable: true,
  writable: true,
});

beforeEach(() => {
  addCalls = [];
  addShouldThrow = false;
  config = configRow();
  userRow = { email: 'alice@acme.test', status: 'Active' };
  fetchCalls = [];
  fetchOverride = {};
});

function jobData(overrides: Partial<SlackDeliveryJobData> = {}): SlackDeliveryJobData {
  return { tenantId: 't1', userId: 'u1', type: 'request_needs_approval', payload: { formTitle: 'Leave', requesterName: 'Bob', requestId: 'r1' }, ...overrides };
}

describe('mirrorToSlack', () => {
  it('enqueues a job for a type with a mapped toggle', () => {
    mirrorToSlack('t1', 'u1', 'request_needs_approval', { requestId: 'r1' });
    assert.equal(addCalls.length, 1);
    assert.equal(addCalls[0].name, 'deliver');
    assert.deepEqual(addCalls[0].data, { tenantId: 't1', userId: 'u1', type: 'request_needs_approval', payload: { requestId: 'r1' } });
    assert.deepEqual(addCalls[0].opts, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
  });

  it('is a no-op for a type with no mapped toggle, without ever calling the queue', () => {
    mirrorToSlack('t1', 'u1', 'some_in_app_only_type', {});
    assert.equal(addCalls.length, 0);
  });

  it('never throws even when the underlying enqueue fails', () => {
    addShouldThrow = true;
    assert.doesNotThrow(() => mirrorToSlack('t1', 'u1', 'request_approved', {}));
  });
});

describe('deliverToSlack', () => {
  it('does nothing when the tenant has no Slack config at all', async () => {
    config = null;
    await deliverToSlack(jobData());
    assert.equal(fetchCalls.length, 0);
  });

  it('does nothing when the config is not connected', async () => {
    config = configRow({ status: 'disconnected' });
    await deliverToSlack(jobData());
    assert.equal(fetchCalls.length, 0);
  });

  it('does nothing when there is no bot token', async () => {
    config = configRow({ botTokenEncrypted: null });
    await deliverToSlack(jobData());
    assert.equal(fetchCalls.length, 0);
  });

  it('does nothing when the type has no mapped toggle', async () => {
    await deliverToSlack(jobData({ type: 'some_in_app_only_type' }));
    assert.equal(fetchCalls.length, 0);
  });

  it("does nothing when the tenant has turned this trigger's toggle off", async () => {
    config = configRow({ notifyApproversOnNewRequest: false });
    await deliverToSlack(jobData({ type: 'request_needs_approval' }));
    assert.equal(fetchCalls.length, 0);
  });

  it('does nothing when the target user is missing or inactive', async () => {
    userRow = null;
    await deliverToSlack(jobData());
    assert.equal(fetchCalls.length, 0);
  });

  it('does nothing when the Slack user id cannot be resolved by email', async () => {
    fetchOverride['users.lookupByEmail'] = { ok: false, error: 'users_not_found' };
    await deliverToSlack(jobData());
    // lookupUserIdByEmail runs (1 fetch), but chat.postMessage never does.
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://slack.com/api/users.lookupByEmail');
  });

  it('resolves the Slack user id by email, then posts the formatted message with approve/reject buttons', async () => {
    fetchOverride['users.lookupByEmail'] = { ok: true, user: { id: 'U42' } };

    await deliverToSlack(jobData());

    assert.equal(fetchCalls.length, 2);
    assert.deepEqual(fetchCalls[0].body, { email: 'alice@acme.test' });
    const postBody = fetchCalls[1].body;
    assert.equal(postBody.channel, 'U42');
    assert.match(String(postBody.text), /Leave.*Bob.*needs your approval/);
    const actionsBlock = (postBody.blocks as { type: string; elements: { action_id: string; value: string }[] }[]).find(
      (b) => b.type === 'actions',
    )!;
    assert.deepEqual(
      actionsBlock.elements.map((e) => e.action_id),
      ['approve', 'reject'],
    );
    assert.equal(actionsBlock.elements[0].value, 'r1');
  });

  it('formats a plain decision message with no action buttons', async () => {
    fetchOverride['users.lookupByEmail'] = { ok: true, user: { id: 'U42' } };

    await deliverToSlack(jobData({ type: 'request_approved', payload: { formTitle: 'Leave', approverName: 'Carol' } }));

    const postBody = fetchCalls[1].body;
    assert.equal(postBody.text, 'Your Leave was approved by Carol.');
    assert.equal('blocks' in postBody, false);
  });
});
