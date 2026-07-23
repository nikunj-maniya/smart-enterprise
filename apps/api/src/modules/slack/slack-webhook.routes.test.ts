import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { prisma } from '../../prisma.js';
import { redisConnection } from '../../lib/redis.js';
import { encryptSecret } from '../../lib/crypto.js';
import { errorHandler } from '../../middleware/error.js';
import { slackWebhookRouter } from './slack-webhook.routes.js';

// slack-webhook.routes.ts imports slack-interactions.service.ts -> decisions.service.ts, which
// transitively imports the eagerly-connecting BullMQ `redisConnection`
// (front-desk.routes.test.ts pattern) — silence and disconnect so the test run can exit with no
// live Redis in CI.
redisConnection.on('error', () => {});
redisConnection.disconnect();

/**
 * This is a public, signature-verified webhook (no requireAuth) — real router + error handler on
 * a throwaway app mirroring index.ts's `express.raw({ type: '*\/*' })` mount ahead of the router,
 * since the HMAC signature covers the exact raw request bytes. `handleInteraction` is fired
 * asynchronously *after* the 200 ack, so the "valid signature" case below uses a payload type
 * (`shortcut`) that resolves as a no-op there (slack-interactions.service.test.ts covers actual
 * dispatch), keeping this suite about the webhook's own auth/parsing gate.
 */
process.env.SLACK_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const SIGNING_SECRET = 'signing-secret';

function buildApp() {
  const app = express();
  app.use('/slack/interactions', express.raw({ type: '*/*' }));
  app.use('/slack/interactions', slackWebhookRouter);
  app.use(errorHandler);
  return app;
}

function sign(secret: string, timestamp: string, rawBody: string): string {
  return `v0=${crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
}

function rawBodyFor(payload: unknown): string {
  return `payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

let config: {
  slackTeamId: string;
  status: string;
  signingSecretEncrypted: string | null;
  botTokenEncrypted: string | null;
} | null;
let findFirstArgs: unknown;

Object.defineProperty(prisma, 'slackConfig', {
  value: {
    findFirst: async (args: unknown) => {
      findFirstArgs = args;
      return config;
    },
  },
  configurable: true,
});

beforeEach(() => {
  config = {
    slackTeamId: 'T1',
    status: 'connected',
    signingSecretEncrypted: encryptSecret(SIGNING_SECRET),
    botTokenEncrypted: encryptSecret('xoxb-token'),
  };
  findFirstArgs = undefined;
});

describe('POST /slack/interactions (pre-signature-check behavior)', () => {
  it('rejects a body with no `payload` form field (400)', async () => {
    const res = await request(buildApp())
      .post('/slack/interactions')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('not_payload=1');
    assert.equal(res.status, 400);
  });

  it('rejects a `payload` field that is not valid JSON (400)', async () => {
    const res = await request(buildApp())
      .post('/slack/interactions')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('payload=not-json');
    assert.equal(res.status, 400);
  });

  it('rejects a payload with no team id (400)', async () => {
    const res = await request(buildApp())
      .post('/slack/interactions')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(rawBodyFor({ type: 'shortcut' }));
    assert.equal(res.status, 400);
  });

  it('rejects when no connected tenant matches the team id (401)', async () => {
    config = null;
    const res = await request(buildApp())
      .post('/slack/interactions')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(rawBodyFor({ type: 'shortcut', team: { id: 'T-unknown' } }));
    assert.equal(res.status, 401);
    assert.deepEqual((findFirstArgs as { where: unknown }).where, { slackTeamId: 'T-unknown', status: 'connected' });
  });

  it('rejects when the matched tenant has no signing secret or bot token on file (401)', async () => {
    config!.signingSecretEncrypted = null;
    const res = await request(buildApp())
      .post('/slack/interactions')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(rawBodyFor({ type: 'shortcut', team: { id: 'T1' } }));
    assert.equal(res.status, 401);
  });
});

describe('POST /slack/interactions (signature verification)', () => {
  it('rejects when the signature/timestamp headers are missing (401)', async () => {
    const res = await request(buildApp())
      .post('/slack/interactions')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(rawBodyFor({ type: 'shortcut', team: { id: 'T1' } }));
    assert.equal(res.status, 401);
  });

  it('rejects an incorrectly computed signature (401)', async () => {
    const body = rawBodyFor({ type: 'shortcut', team: { id: 'T1' } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await request(buildApp())
      .post('/slack/interactions')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-signature', sign('wrong-secret', timestamp, body))
      .set('x-slack-request-timestamp', timestamp)
      .send(body);
    assert.equal(res.status, 401);
  });

  it('rejects a signature computed over a different body than what was sent (401)', async () => {
    const sentBody = rawBodyFor({ type: 'shortcut', team: { id: 'T1' } });
    const signedBody = rawBodyFor({ type: 'shortcut', team: { id: 'T1' }, tampered: true });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await request(buildApp())
      .post('/slack/interactions')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-signature', sign(SIGNING_SECRET, timestamp, signedBody))
      .set('x-slack-request-timestamp', timestamp)
      .send(sentBody);
    assert.equal(res.status, 401);
  });

  it('rejects a stale timestamp outside the 5-minute replay window (401)', async () => {
    const body = rawBodyFor({ type: 'shortcut', team: { id: 'T1' } });
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);
    const res = await request(buildApp())
      .post('/slack/interactions')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-signature', sign(SIGNING_SECRET, staleTimestamp, body))
      .set('x-slack-request-timestamp', staleTimestamp)
      .send(body);
    assert.equal(res.status, 401);
  });

  it('accepts a correctly signed, fresh request and acks with 200', async () => {
    const body = rawBodyFor({ type: 'shortcut', team: { id: 'T1' } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await request(buildApp())
      .post('/slack/interactions')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-signature', sign(SIGNING_SECRET, timestamp, body))
      .set('x-slack-request-timestamp', timestamp)
      .send(body);
    assert.equal(res.status, 200);
  });
});
