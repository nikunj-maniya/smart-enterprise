import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  authTest,
  getUserEmail,
  lookupUserIdByEmail,
  openView,
  postEphemeral,
  postMessage,
  updateMessage,
} from './slack-client.js';

/**
 * slack-client.ts wraps `fetch` to call the Slack Web API — stub `globalThis.fetch` directly
 * (slack-digest.job.test.ts pattern) rather than hitting the real network. Every exported
 * function funnels through the same `callSlack` helper, so the ok:false/error-shape behavior is
 * only asserted once (via `authTest`); the rest focus on each function's own request/response
 * mapping.
 */
let calls: Array<{ url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> }>;
let response: { ok: boolean; error?: string; [key: string]: unknown };

Object.defineProperty(globalThis, 'fetch', {
  value: async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    calls.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    return { json: async () => response };
  },
  configurable: true,
  writable: true,
});

beforeEach(() => {
  calls = [];
  response = { ok: true };
});

describe('callSlack (shared request/error behavior)', () => {
  it('posts to the Slack API with a bearer token and JSON content type', async () => {
    response = { ok: true, team: 'Acme', team_id: 'T1' };
    await authTest('xoxb-token');

    assert.equal(calls[0].url, 'https://slack.com/api/auth.test');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].headers.Authorization, 'Bearer xoxb-token');
    assert.equal(calls[0].headers['Content-Type'], 'application/json; charset=utf-8');
  });

  it('throws with the Slack error code when the API responds ok:false', async () => {
    response = { ok: false, error: 'invalid_auth' };
    await assert.rejects(authTest('bad-token'), /Slack API error \(auth\.test\): invalid_auth/);
  });

  it('falls back to "unknown_error" when ok:false carries no error field', async () => {
    response = { ok: false };
    await assert.rejects(authTest('bad-token'), /Slack API error \(auth\.test\): unknown_error/);
  });
});

describe('authTest', () => {
  it('returns the connected workspace name and team id', async () => {
    response = { ok: true, team: 'Acme Corp', team_id: 'T123' };
    const result = await authTest('xoxb-token');
    assert.deepEqual(result, { team: 'Acme Corp', teamId: 'T123' });
  });
});

describe('postMessage', () => {
  it('sends channel/text and includes blocks only when provided', async () => {
    response = { ok: true, ts: '111.222', channel: 'C1' };
    const result = await postMessage('xoxb-token', 'C1', 'hello', [{ type: 'section' }]);

    assert.deepEqual(calls[0].body, { channel: 'C1', text: 'hello', blocks: [{ type: 'section' }] });
    assert.deepEqual(result, { ts: '111.222', channel: 'C1' });
  });

  it('omits the blocks key entirely when no blocks are given', async () => {
    response = { ok: true, ts: '111.222', channel: 'C1' };
    await postMessage('xoxb-token', 'C1', 'hello');

    assert.deepEqual(calls[0].body, { channel: 'C1', text: 'hello' });
    assert.equal('blocks' in calls[0].body, false);
  });
});

describe('updateMessage', () => {
  it('defaults blocks to an empty array when not given', async () => {
    await updateMessage('xoxb-token', 'C1', '111.222', 'edited');
    assert.deepEqual(calls[0].body, { channel: 'C1', ts: '111.222', text: 'edited', blocks: [] });
    assert.equal(calls[0].url, 'https://slack.com/api/chat.update');
  });
});

describe('postEphemeral', () => {
  it('posts an ephemeral message to a user in a channel', async () => {
    await postEphemeral('xoxb-token', 'C1', 'U1', 'only you can see this');
    assert.equal(calls[0].url, 'https://slack.com/api/chat.postEphemeral');
    assert.deepEqual(calls[0].body, { channel: 'C1', user: 'U1', text: 'only you can see this' });
  });
});

describe('getUserEmail', () => {
  it("resolves a Slack user's verified profile email", async () => {
    response = { ok: true, user: { profile: { email: 'alice@acme.test' } } };
    const email = await getUserEmail('xoxb-token', 'U1');
    assert.equal(email, 'alice@acme.test');
  });

  it('returns null when the user has no profile email', async () => {
    response = { ok: true, user: { profile: {} } };
    assert.equal(await getUserEmail('xoxb-token', 'U1'), null);
  });

  it('returns null when the user object itself is absent', async () => {
    response = { ok: true };
    assert.equal(await getUserEmail('xoxb-token', 'U1'), null);
  });
});

describe('lookupUserIdByEmail', () => {
  it('resolves a Slack user id for a known email', async () => {
    response = { ok: true, user: { id: 'U42' } };
    assert.equal(await lookupUserIdByEmail('xoxb-token', 'alice@acme.test'), 'U42');
  });

  it('returns null (not a throw) when the lookup fails, e.g. users_not_found', async () => {
    response = { ok: false, error: 'users_not_found' };
    assert.equal(await lookupUserIdByEmail('xoxb-token', 'nobody@acme.test'), null);
  });
});

describe('openView', () => {
  it('opens a modal view with the given trigger id', async () => {
    const view = { type: 'modal', callback_id: 'reject_reason' };
    await openView('xoxb-token', 'trigger-1', view);
    assert.equal(calls[0].url, 'https://slack.com/api/views.open');
    assert.deepEqual(calls[0].body, { trigger_id: 'trigger-1', view });
  });
});
