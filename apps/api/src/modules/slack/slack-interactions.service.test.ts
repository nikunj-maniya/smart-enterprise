import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { SlackConfig } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { redisConnection } from '../../lib/redis.js';
import { encryptSecret } from '../../lib/crypto.js';
import { handleInteraction } from './slack-interactions.service.js';

// slack-interactions.service.ts imports decisions.service.ts, which transitively imports the
// eagerly-connecting BullMQ `redisConnection` (front-desk.routes.test.ts pattern) — silence and
// disconnect so the test run can exit with no live Redis in CI.
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * Covers payload parsing and action dispatch, with Prisma stubbed (forms.service.test.ts
 * pattern) and Slack API calls (via slack-client.ts) going through a stubbed `fetch`
 * (slack-digest.job.test.ts pattern). `decideOnRequest` (../requests/decisions.service.js) is the
 * real implementation, reading through the same stubbed `prisma.$transaction` — only its shallow
 * "request not found" error path is exercised here (a stubbed `tx.request.findFirst` returning
 * null), since the full approve/reject request-lifecycle behavior is decisions.service.ts's own
 * concern and needs a live DB, unavailable in CI.
 */
process.env.SLACK_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

function slackConfig(overrides: Partial<SlackConfig> = {}): SlackConfig {
  return {
    id: 'sc1',
    tenantId: 't1',
    status: 'connected',
    workspaceName: 'Acme Corp',
    slackTeamId: 'T1',
    defaultChannel: '#general',
    botTokenEncrypted: encryptSecret('xoxb-token'),
    signingSecretEncrypted: encryptSecret('signing-secret'),
    lastErrorMessage: null,
    notifyApproversOnNewRequest: true,
    notifyRequesterOnDecision: true,
    notifyRequesterOnStatusChange: true,
    digestEnabled: false,
    digestChannel: null,
    digestTime: null,
    lastDigestSentDate: null,
    reminderEnabled: false,
    updatedAt: new Date(),
    ...overrides,
  };
}

let matchedUser: { id: string; name: string; email: string } | null;
let txRequestFindFirstResult: unknown;
let fetchCalls: Array<{ url: string; body: Record<string, unknown> }>;
let fetchOverride: Partial<Record<string, { ok: boolean; [key: string]: unknown }>>;

Object.defineProperty(prisma, 'user', {
  value: {
    findFirst: async () => matchedUser,
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: { request: { findFirst: () => Promise<unknown> } }) => Promise<unknown>) =>
    fn({ request: { findFirst: async () => txRequestFindFirstResult } }),
  configurable: true,
});
Object.defineProperty(globalThis, 'fetch', {
  value: async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    fetchCalls.push({ url: String(url), body });
    const method = String(url).split('/').pop()!;
    return { json: async () => fetchOverride[method] ?? { ok: true } };
  },
  configurable: true,
  writable: true,
});

beforeEach(() => {
  matchedUser = { id: 'u1', name: 'Alice', email: 'alice@acme.test' };
  txRequestFindFirstResult = null; // decideOnRequest throws HttpError(404) whenever it's reached
  fetchCalls = [];
  fetchOverride = {};
});

describe('handleInteraction dispatch', () => {
  it('ignores a payload type it does not recognize (no Slack/DB calls)', async () => {
    await handleInteraction(slackConfig(), { type: 'shortcut' });
    assert.equal(fetchCalls.length, 0);
  });
});

describe('block_actions: approve/reject button clicks', () => {
  it('no-ops when required fields are missing from the action payload', async () => {
    await handleInteraction(slackConfig(), {
      type: 'block_actions',
      user: { id: 'U1' },
      channel: { id: 'C1' },
      // no `message` and no `actions` — action/messageTs/requestId all missing
    });
    assert.equal(fetchCalls.length, 0);
  });

  it("posts an ephemeral message when the Slack user isn't linked to any platform account", async () => {
    fetchOverride['users.info'] = { ok: true, user: { profile: {} } }; // no email -> no match attempted
    await handleInteraction(slackConfig(), {
      type: 'block_actions',
      user: { id: 'U1' },
      channel: { id: 'C1' },
      message: { ts: '100.1' },
      actions: [{ action_id: 'approve', value: 'r1' }],
    });

    const ephemeral = fetchCalls.find((c) => c.url.endsWith('chat.postEphemeral'));
    assert.ok(ephemeral);
    assert.equal(ephemeral!.body.channel, 'C1');
    assert.equal(ephemeral!.body.user, 'U1');
    assert.match(String(ephemeral!.body.text), /isn't linked to a Smart Enterprise user/);
  });

  it('posts an ephemeral message when the email resolves but no active platform user matches', async () => {
    fetchOverride['users.info'] = { ok: true, user: { profile: { email: 'ghost@acme.test' } } };
    matchedUser = null;

    await handleInteraction(slackConfig(), {
      type: 'block_actions',
      user: { id: 'U1' },
      channel: { id: 'C1' },
      message: { ts: '100.1' },
      actions: [{ action_id: 'approve', value: 'r1' }],
    });

    const ephemeral = fetchCalls.find((c) => c.url.endsWith('chat.postEphemeral'));
    assert.ok(ephemeral);
  });

  it('on approve: calls the decision engine and reports the error back into Slack when it rejects', async () => {
    fetchOverride['users.info'] = { ok: true, user: { profile: { email: 'alice@acme.test' } } };

    await handleInteraction(slackConfig(), {
      type: 'block_actions',
      user: { id: 'U1' },
      channel: { id: 'C1' },
      message: { ts: '100.1' },
      actions: [{ action_id: 'approve', value: 'r1' }],
    });

    const ephemeral = fetchCalls.find((c) => c.url.endsWith('chat.postEphemeral'));
    assert.ok(ephemeral);
    assert.equal(ephemeral!.body.text, 'Request not found');
    assert.equal(fetchCalls.some((c) => c.url.endsWith('chat.update')), false);
  });

  it('on reject with a trigger_id: opens the reject-reason modal instead of deciding immediately', async () => {
    fetchOverride['users.info'] = { ok: true, user: { profile: { email: 'alice@acme.test' } } };

    await handleInteraction(slackConfig(), {
      type: 'block_actions',
      user: { id: 'U1' },
      channel: { id: 'C1' },
      message: { ts: '100.1' },
      trigger_id: 'trigger-1',
      actions: [{ action_id: 'reject', value: 'r1' }],
    });

    const openView = fetchCalls.find((c) => c.url.endsWith('views.open'));
    assert.ok(openView);
    assert.equal(openView!.body.trigger_id, 'trigger-1');
    const view = openView!.body.view as { callback_id: string; private_metadata: string };
    assert.equal(view.callback_id, 'reject_reason');
    assert.deepEqual(JSON.parse(view.private_metadata), { requestId: 'r1', channelId: 'C1', messageTs: '100.1' });
  });

  it('on reject with no trigger_id: does not open a modal (defensive no-op)', async () => {
    fetchOverride['users.info'] = { ok: true, user: { profile: { email: 'alice@acme.test' } } };

    await handleInteraction(slackConfig(), {
      type: 'block_actions',
      user: { id: 'U1' },
      channel: { id: 'C1' },
      message: { ts: '100.1' },
      actions: [{ action_id: 'reject', value: 'r1' }],
    });

    assert.equal(fetchCalls.some((c) => c.url.endsWith('views.open')), false);
  });
});

describe('view_submission: reject-reason modal', () => {
  const meta = JSON.stringify({ requestId: 'r1', channelId: 'C1', messageTs: '100.1' });

  it('ignores a view submission for any other callback_id', async () => {
    await handleInteraction(slackConfig(), {
      type: 'view_submission',
      user: { id: 'U1' },
      view: { callback_id: 'something_else', private_metadata: meta, state: { values: {} } },
    });
    assert.equal(fetchCalls.length, 0);
  });

  it('is a defensive no-op when the Slack user cannot be matched (should be unreachable in practice)', async () => {
    fetchOverride['users.info'] = { ok: true, user: { profile: {} } };
    matchedUser = null;

    await handleInteraction(slackConfig(), {
      type: 'view_submission',
      user: { id: 'U1' },
      view: {
        callback_id: 'reject_reason',
        private_metadata: meta,
        state: { values: { reason_block: { reason_input: { value: 'Not needed' } } } },
      },
    });

    assert.equal(fetchCalls.some((c) => c.url.endsWith('chat.postEphemeral')), false);
  });

  it('decides the rejection and swallows a failure by posting an ephemeral report to the user', async () => {
    fetchOverride['users.info'] = { ok: true, user: { profile: { email: 'alice@acme.test' } } };

    await handleInteraction(slackConfig(), {
      type: 'view_submission',
      user: { id: 'U1' },
      view: {
        callback_id: 'reject_reason',
        private_metadata: meta,
        state: { values: { reason_block: { reason_input: { value: 'Not needed' } } } },
      },
    });

    const ephemeral = fetchCalls.find((c) => c.url.endsWith('chat.postEphemeral'));
    assert.ok(ephemeral);
    assert.equal(ephemeral!.body.channel, 'C1');
    assert.equal(ephemeral!.body.text, 'Request not found');
  });
});
