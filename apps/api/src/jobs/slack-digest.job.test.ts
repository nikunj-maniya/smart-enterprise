import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { redisConnection } from '../lib/redis.js';
import { encryptSecret } from '../lib/crypto.js';
import { runSlackDigest } from './slack-digest.job.js';

// See approval-reminders.job.test.ts: importing any job module pulls in the eagerly-connecting
// `redisConnection` — disconnect immediately so an unreachable Redis doesn't hang the process.
redisConnection.disconnect();

process.env.SLACK_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
const BOT_TOKEN_ENCRYPTED = encryptSecret('xoxb-token');

/** Mirrors `istNow()` + the `.slice(0, 10)` in slack-digest.job.ts, to build fixtures that agree
 *  with the job's own notion of "today" — not a re-test of that formula itself. */
function todayIST(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return now.toISOString().slice(0, 10);
}

type Config = {
  id: string;
  tenantId: string;
  status: string;
  digestEnabled: boolean;
  digestChannel: string | null;
  digestTime: string | null;
  botTokenEncrypted: string | null;
  lastDigestSentDate: string | null;
};

let configs: Config[];
let absences: Array<{ requester: { name: string }; form: { key: string }; startDate: Date; endDate: Date }>;
let findManyArgs: unknown[];
let requestFindManyArgs: unknown[];
let updateArgs: unknown[];
let fetchCalls: Array<{ url: string; body: Record<string, unknown> }>;
let fetchOk: boolean;

Object.defineProperty(prisma, 'slackConfig', {
  value: {
    findMany: async (args: unknown) => {
      findManyArgs.push(args);
      return configs;
    },
    update: async (args: unknown) => {
      updateArgs.push(args);
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'request', {
  value: {
    findMany: async (args: unknown) => {
      requestFindManyArgs.push(args);
      return absences;
    },
  },
  configurable: true,
});

const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, 'fetch', {
  value: async (url: string, init: { body?: string }) => {
    const body = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    fetchCalls.push({ url: String(url), body });
    return {
      json: async () => (fetchOk ? { ok: true, ts: '123', channel: 'C1' } : { ok: false, error: 'channel_not_found' }),
    };
  },
  configurable: true,
  writable: true,
});

beforeEach(() => {
  configs = [];
  absences = [];
  findManyArgs = [];
  requestFindManyArgs = [];
  updateArgs = [];
  fetchCalls = [];
  fetchOk = true;
});

function config(overrides: Partial<Config> = {}): Config {
  return {
    id: 'cfg-1',
    tenantId: 't1',
    status: 'connected',
    digestEnabled: true,
    digestChannel: 'C-digest',
    digestTime: '09:00',
    botTokenEncrypted: BOT_TOKEN_ENCRYPTED,
    lastDigestSentDate: null,
    ...overrides,
  };
}

test('posts each connected tenant\'s absence list and marks the digest sent for today', async () => {
  configs = [config()];
  absences = [
    { requester: { name: 'Alice' }, form: { key: 'leave' }, startDate: new Date('2026-01-05T00:00:00Z'), endDate: new Date('2026-01-05T00:00:00Z') },
  ];

  await runSlackDigest();

  assert.equal(fetchCalls.length, 1);
  assert.match(String(fetchCalls[0].body.text), /Alice.*Leave/s);
  assert.equal(fetchCalls[0].body.channel, 'C-digest');

  assert.equal(updateArgs.length, 1);
  const { where, data } = updateArgs[0] as { where: { id: string }; data: { lastDigestSentDate: string } };
  assert.equal(where.id, 'cfg-1');
  assert.equal(data.lastDigestSentDate, todayIST());
});

test('shows "No one is away today" when nobody has an approved absence', async () => {
  configs = [config()];
  absences = [];

  await runSlackDigest();

  assert.equal(fetchCalls[0].body.text, "*Today's absences*\nNo one is away today.");
});

test('skips a tenant whose digest has already been sent today, without posting again', async () => {
  configs = [config({ lastDigestSentDate: todayIST() })];

  await runSlackDigest();

  assert.equal(fetchCalls.length, 0);
  assert.equal(updateArgs.length, 0);
});

test('leaves lastDigestSentDate untouched when the Slack post fails, so the next tick retries', async () => {
  configs = [config()];
  fetchOk = false;

  await runSlackDigest();

  assert.equal(fetchCalls.length, 1);
  assert.equal(updateArgs.length, 0);
});

test('only queries connected, digest-enabled tenants with a configured channel and bot token', async () => {
  configs = [];
  await runSlackDigest();

  const { where } = findManyArgs[0] as { where: Record<string, unknown> };
  assert.equal(where.status, 'connected');
  assert.equal(where.digestEnabled, true);
  assert.deepEqual(where.digestChannel, { not: null });
  assert.deepEqual(where.botTokenEncrypted, { not: null });
  assert.match(String(where.digestTime), /^\d{2}:\d{2}$/);
});
