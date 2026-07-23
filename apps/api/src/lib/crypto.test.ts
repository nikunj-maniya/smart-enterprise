import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { decryptSecret, encryptSecret, verifySlackSignature } from './crypto.js';

const KEY = crypto.randomBytes(32).toString('base64');

test('encryptSecret/decryptSecret round-trips plaintext', () => {
  process.env.SLACK_ENCRYPTION_KEY = KEY;
  const ciphertext = encryptSecret('xoxb-super-secret-token');
  assert.notEqual(ciphertext, 'xoxb-super-secret-token');
  assert.equal(decryptSecret(ciphertext), 'xoxb-super-secret-token');
});

test('encryptSecret produces a different ciphertext each call (random IV)', () => {
  process.env.SLACK_ENCRYPTION_KEY = KEY;
  const a = encryptSecret('same-plaintext');
  const b = encryptSecret('same-plaintext');
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), 'same-plaintext');
  assert.equal(decryptSecret(b), 'same-plaintext');
});

test('decryptSecret throws when the auth tag does not match (tampered ciphertext)', () => {
  process.env.SLACK_ENCRYPTION_KEY = KEY;
  const ciphertext = encryptSecret('xoxb-super-secret-token');
  const buf = Buffer.from(ciphertext, 'base64');
  buf[buf.length - 1] ^= 0xff; // flip the last ciphertext byte
  assert.throws(() => decryptSecret(buf.toString('base64')));
});

test('encryptSecret throws when SLACK_ENCRYPTION_KEY is not configured', () => {
  delete process.env.SLACK_ENCRYPTION_KEY;
  assert.throws(() => encryptSecret('x'), /SLACK_ENCRYPTION_KEY is not configured/);
});

test('encryptSecret throws when SLACK_ENCRYPTION_KEY does not decode to 32 bytes', () => {
  process.env.SLACK_ENCRYPTION_KEY = Buffer.from('too-short').toString('base64');
  assert.throws(() => encryptSecret('x'), /must decode to exactly 32 bytes/);
});

test('verifySlackSignature accepts a correctly computed signature within the replay window', () => {
  const signingSecret = 'signing-secret';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = 'payload=abc';
  const signature = `v0=${crypto.createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
  assert.equal(verifySlackSignature(signingSecret, timestamp, rawBody, signature), true);
});

test('verifySlackSignature rejects a signature computed with the wrong secret', () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = 'payload=abc';
  const signature = `v0=${crypto.createHmac('sha256', 'wrong-secret').update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
  assert.equal(verifySlackSignature('signing-secret', timestamp, rawBody, signature), false);
});

test('verifySlackSignature rejects a tampered body even with a stale-but-matching signature', () => {
  const signingSecret = 'signing-secret';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v0=${crypto.createHmac('sha256', signingSecret).update(`v0:${timestamp}:original-body`).digest('hex')}`;
  assert.equal(verifySlackSignature(signingSecret, timestamp, 'tampered-body', signature), false);
});

test('verifySlackSignature rejects a timestamp outside the 5-minute replay window', () => {
  const signingSecret = 'signing-secret';
  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);
  const rawBody = 'payload=abc';
  const signature = `v0=${crypto.createHmac('sha256', signingSecret).update(`v0:${staleTimestamp}:${rawBody}`).digest('hex')}`;
  assert.equal(verifySlackSignature(signingSecret, staleTimestamp, rawBody, signature), false);
});

test('verifySlackSignature rejects a non-numeric timestamp', () => {
  const signingSecret = 'signing-secret';
  const signature = `v0=${crypto.createHmac('sha256', signingSecret).update('v0:not-a-number:body').digest('hex')}`;
  assert.equal(verifySlackSignature(signingSecret, 'not-a-number', 'body', signature), false);
});
