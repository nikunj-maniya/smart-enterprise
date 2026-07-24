import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { decryptSecret, encryptSecret } from '../../lib/crypto.js';
import { connect, disconnect, getConfig, testConnection, updateSettings } from './slack-config.service.js';

/**
 * Stubbed-Prisma suite (forms.service.test.ts / departments.service.test.ts pattern): the
 * `slackConfig`/`auditLog` delegates and `$transaction` this service reads/writes are redefined
 * as in-memory stubs, reset in `beforeEach` — no live DB in CI. `slack-client.ts`'s calls
 * (`authTest`, `postMessage`) go through `fetch`, stubbed directly (slack-digest.job.test.ts
 * pattern) rather than mocking the `slackClient` module.
 */
process.env.SLACK_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

type ConfigRow = {
  id: string;
  tenantId: string;
  status: string;
  workspaceName: string | null;
  slackTeamId: string | null;
  defaultChannel: string | null;
  botTokenEncrypted: string | null;
  signingSecretEncrypted: string | null;
  lastErrorMessage: string | null;
  notifyApproversOnNewRequest: boolean;
  notifyRequesterOnDecision: boolean;
  notifyRequesterOnStatusChange: boolean;
  digestEnabled: boolean;
  digestChannel: string | null;
  digestTime: string | null;
  reminderEnabled: boolean;
};

function configRow(overrides: Partial<ConfigRow> = {}): ConfigRow {
  return {
    id: 'sc1',
    tenantId: 't1',
    status: 'disconnected',
    workspaceName: null,
    slackTeamId: null,
    defaultChannel: null,
    botTokenEncrypted: null,
    signingSecretEncrypted: null,
    lastErrorMessage: null,
    notifyApproversOnNewRequest: true,
    notifyRequesterOnDecision: true,
    notifyRequesterOnStatusChange: true,
    digestEnabled: false,
    digestChannel: null,
    digestTime: null,
    reminderEnabled: false,
    ...overrides,
  };
}

let existingRow: ConfigRow | null;
let upsertResult: ConfigRow;
let txUpdateResult: ConfigRow;
let fetchResponse: { ok: boolean; error?: string; [key: string]: unknown };

const calls = {
  upsert: [] as unknown[],
  findUnique: [] as unknown[],
  update: [] as unknown[],
  auditCreate: [] as unknown[],
  transactions: 0,
  txUpsert: [] as unknown[],
  txUpdate: [] as unknown[],
  txAuditCreate: [] as unknown[],
  fetch: [] as { url: string; body: Record<string, unknown> }[],
};

const txStub = {
  slackConfig: {
    upsert: async (args: unknown) => {
      calls.txUpsert.push(args);
      return txUpdateResult;
    },
    update: async (args: unknown) => {
      calls.txUpdate.push(args);
      return txUpdateResult;
    },
  },
  auditLog: {
    create: async (args: unknown) => {
      calls.txAuditCreate.push(args);
    },
  },
};

Object.defineProperty(prisma, 'slackConfig', {
  value: {
    upsert: async (args: unknown) => {
      calls.upsert.push(args);
      return upsertResult;
    },
    findUnique: async (args: unknown) => {
      calls.findUnique.push(args);
      return existingRow;
    },
    update: async (args: unknown) => {
      calls.update.push(args);
      return existingRow;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'auditLog', {
  value: {
    create: async (args: unknown) => {
      calls.auditCreate.push(args);
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: typeof txStub) => Promise<unknown>) => {
    calls.transactions += 1;
    return fn(txStub);
  },
  configurable: true,
});
Object.defineProperty(globalThis, 'fetch', {
  value: async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.fetch.push({ url: String(url), body });
    return { json: async () => fetchResponse };
  },
  configurable: true,
  writable: true,
});

beforeEach(() => {
  existingRow = null;
  upsertResult = configRow();
  txUpdateResult = configRow();
  fetchResponse = { ok: true };
  for (const arr of Object.values(calls)) {
    if (Array.isArray(arr)) arr.length = 0;
  }
  calls.transactions = 0;
});

describe('getConfig', () => {
  it('upserts the (disconnected) singleton row on first read and maps it to the DTO', async () => {
    upsertResult = configRow();

    const dto = await getConfig('t1');

    assert.deepEqual(calls.upsert[0], { where: { tenantId: 't1' }, create: { tenantId: 't1' }, update: {} });
    assert.deepEqual(Object.keys(dto).sort(), [
      'defaultChannel',
      'digestChannel',
      'digestEnabled',
      'digestTime',
      'lastErrorMessage',
      'notifyApproversOnNewRequest',
      'notifyRequesterOnDecision',
      'notifyRequesterOnStatusChange',
      'reminderEnabled',
      'status',
      'workspaceName',
    ]);
  });

  it('never leaks credential material into the DTO', async () => {
    upsertResult = configRow({ botTokenEncrypted: 'cipher', signingSecretEncrypted: 'cipher', slackTeamId: 'T1' });

    const dto = await getConfig('t1');

    assert.equal('botTokenEncrypted' in dto, false);
    assert.equal('signingSecretEncrypted' in dto, false);
    assert.equal('slackTeamId' in dto, false);
    assert.equal('tenantId' in dto, false);
  });
});

describe('connect', () => {
  const input = { botToken: 'xoxb-new-token', signingSecret: 'new-signing-secret', defaultChannel: '#general' };

  it('rejects with 400 when Slack cannot verify the credentials, before opening a transaction', async () => {
    fetchResponse = { ok: false, error: 'invalid_auth' };

    await assert.rejects(connect('t1', 'actor1', input), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 400);
      assert.match(err.message, /Could not verify these Slack credentials/);
      return true;
    });
    assert.equal(calls.transactions, 0);
  });

  it('verifies via auth.test, then persists encrypted credentials and audit-logs the connect', async () => {
    fetchResponse = { ok: true, team: 'Acme Corp', team_id: 'T123' };
    txUpdateResult = configRow({ status: 'connected', workspaceName: 'Acme Corp', slackTeamId: 'T123', defaultChannel: '#general' });

    const dto = await connect('t1', 'actor1', input);

    assert.equal(calls.fetch[0].url, 'https://slack.com/api/auth.test');
    const upsertArgs = calls.txUpsert[0] as { where: { tenantId: string }; create: Record<string, unknown>; update: Record<string, unknown> };
    assert.equal(upsertArgs.where.tenantId, 't1');
    assert.equal(upsertArgs.create.status, 'connected');
    assert.equal(upsertArgs.create.workspaceName, 'Acme Corp');
    assert.equal(upsertArgs.create.slackTeamId, 'T123');
    assert.equal(upsertArgs.create.defaultChannel, '#general');
    // Credentials are stored encrypted, not verbatim, but must round-trip to the original input.
    assert.notEqual(upsertArgs.create.botTokenEncrypted, input.botToken);
    assert.equal(decryptSecret(upsertArgs.create.botTokenEncrypted as string), input.botToken);
    assert.equal(decryptSecret(upsertArgs.update.signingSecretEncrypted as string), input.signingSecret);
    assert.equal((upsertArgs.update as { lastErrorMessage: unknown }).lastErrorMessage, null);

    assert.deepEqual(calls.txAuditCreate[0], {
      data: {
        tenantId: 't1',
        actorId: 'actor1',
        entity: 'SlackConfig',
        entityId: 'sc1',
        action: 'connect',
        after: { workspaceName: 'Acme Corp', defaultChannel: '#general' },
      },
    });
    assert.equal(dto.status, 'connected');
    assert.equal(dto.workspaceName, 'Acme Corp');
  });
});

describe('disconnect', () => {
  it('throws 404 when Slack is not configured for the tenant', async () => {
    existingRow = null;
    await assert.rejects(disconnect('t1', 'actor1'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 404);
      return true;
    });
    assert.equal(calls.transactions, 0);
  });

  it('clears credentials and workspace identity, and audit-logs the disconnect', async () => {
    existingRow = configRow({ status: 'connected', workspaceName: 'Acme Corp', slackTeamId: 'T123', botTokenEncrypted: 'x', signingSecretEncrypted: 'y' });
    txUpdateResult = configRow({ status: 'disconnected' });

    const dto = await disconnect('t1', 'actor1');

    assert.deepEqual((calls.txUpdate[0] as { data: unknown }).data, {
      status: 'disconnected',
      workspaceName: null,
      slackTeamId: null,
      botTokenEncrypted: null,
      signingSecretEncrypted: null,
      lastErrorMessage: null,
    });
    assert.deepEqual(calls.txAuditCreate[0], {
      data: { tenantId: 't1', actorId: 'actor1', entity: 'SlackConfig', entityId: 'sc1', action: 'disconnect' },
    });
    assert.equal(dto.status, 'disconnected');
  });
});

describe('testConnection', () => {
  it('rejects with 400 when Slack is not configured at all', async () => {
    existingRow = null;
    await assert.rejects(testConnection('t1', 'actor1'), (err: unknown) => err instanceof HttpError && err.status === 400);
  });

  it('rejects with 400 when the config is not connected', async () => {
    existingRow = configRow({ status: 'disconnected', botTokenEncrypted: 'x', defaultChannel: '#general' });
    await assert.rejects(testConnection('t1', 'actor1'), (err: unknown) => err instanceof HttpError && err.status === 400);
  });

  it('rejects with 400 when no default channel is set', async () => {
    existingRow = configRow({ status: 'connected', botTokenEncrypted: 'x', defaultChannel: null });
    await assert.rejects(testConnection('t1', 'actor1'), (err: unknown) => err instanceof HttpError && err.status === 400);
  });

  it('sends a real test message and audit-logs success, without touching status', async () => {
    existingRow = configRow({ status: 'connected', botTokenEncrypted: encryptSecret('xoxb-token'), defaultChannel: '#general' });
    fetchResponse = { ok: true, ts: '1', channel: '#general' };

    await testConnection('t1', 'actor1');

    assert.equal(calls.fetch[0].url, 'https://slack.com/api/chat.postMessage');
    assert.equal(calls.update.length, 0);
    assert.deepEqual(calls.auditCreate[0], {
      data: { tenantId: 't1', actorId: 'actor1', entity: 'SlackConfig', entityId: 'sc1', action: 'test-connection' },
    });
  });

  it('marks the config errored and rejects with 400 when the test message fails to send', async () => {
    existingRow = configRow({ status: 'connected', botTokenEncrypted: encryptSecret('xoxb-token'), defaultChannel: '#general' });
    fetchResponse = { ok: false, error: 'channel_not_found' };

    await assert.rejects(testConnection('t1', 'actor1'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 400);
      assert.match(err.message, /Could not send a test message/);
      return true;
    });

    assert.equal(calls.update.length, 1);
    const { where, data } = calls.update[0] as { where: { tenantId: string }; data: { status: string; lastErrorMessage: string } };
    assert.equal(where.tenantId, 't1');
    assert.equal(data.status, 'error');
    assert.match(data.lastErrorMessage, /channel_not_found/);
    assert.equal(calls.auditCreate.length, 0);
  });
});

describe('updateSettings', () => {
  const toggles = {
    notifyApproversOnNewRequest: false,
    notifyRequesterOnDecision: true,
    notifyRequesterOnStatusChange: false,
    digestEnabled: true,
    reminderEnabled: true,
  };

  it('falls back to the existing default channel when none is provided', async () => {
    upsertResult = configRow({ defaultChannel: '#existing' });
    txUpdateResult = configRow({ defaultChannel: '#existing', ...toggles });

    await updateSettings('t1', 'actor1', toggles);

    assert.equal((calls.txUpdate[0] as { data: { defaultChannel: string } }).data.defaultChannel, '#existing');
  });

  it('overrides the default channel when one is provided', async () => {
    upsertResult = configRow({ defaultChannel: '#existing' });

    await updateSettings('t1', 'actor1', { ...toggles, defaultChannel: '#new-channel' });

    assert.equal((calls.txUpdate[0] as { data: { defaultChannel: string } }).data.defaultChannel, '#new-channel');
  });

  it('defaults digestChannel and digestTime to null when omitted', async () => {
    await updateSettings('t1', 'actor1', toggles);

    const data = (calls.txUpdate[0] as { data: { digestChannel: unknown; digestTime: unknown } }).data;
    assert.equal(data.digestChannel, null);
    assert.equal(data.digestTime, null);
  });

  it('persists digestChannel and digestTime when provided', async () => {
    await updateSettings('t1', 'actor1', { ...toggles, digestChannel: '#digest', digestTime: '09:00' });

    const data = (calls.txUpdate[0] as { data: { digestChannel: unknown; digestTime: unknown } }).data;
    assert.equal(data.digestChannel, '#digest');
    assert.equal(data.digestTime, '09:00');
  });

  it('audit-logs before/after snapshots and never touches credentials', async () => {
    upsertResult = configRow({ botTokenEncrypted: 'secret-cipher', notifyApproversOnNewRequest: true });
    txUpdateResult = configRow({ botTokenEncrypted: 'secret-cipher', ...toggles });

    const dto = await updateSettings('t1', 'actor1', toggles);

    const { data } = calls.txAuditCreate[0] as { data: { before: Record<string, unknown>; after: Record<string, unknown> } };
    assert.equal((data.before as { notifyApproversOnNewRequest: boolean }).notifyApproversOnNewRequest, true);
    assert.equal((data.after as { notifyApproversOnNewRequest: boolean }).notifyApproversOnNewRequest, false);
    assert.equal('botTokenEncrypted' in data.before, false);
    assert.equal('botTokenEncrypted' in dto, false);
  });
});
