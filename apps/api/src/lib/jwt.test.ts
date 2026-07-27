import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { signAccessToken, verifyAccessToken } from './jwt.js';

test('signAccessToken/verifyAccessToken round-trips the user id', () => {
  const token = signAccessToken('user-1');
  assert.equal(verifyAccessToken(token).sub, 'user-1');
});

test('verifyAccessToken rejects a token signed with a different secret', () => {
  const forged = jwt.sign({ sub: 'user-2' }, 'some-other-secret');
  assert.throws(() => verifyAccessToken(forged));
});

test('verifyAccessToken rejects an expired token', () => {
  const accessSecret = process.env.JWT_ACCESS_SECRET!;
  const expired = jwt.sign({ sub: 'user-5' }, accessSecret, { expiresIn: -10 });
  assert.throws(() => verifyAccessToken(expired), /jwt expired/);
});

test('verifyAccessToken rejects a malformed token', () => {
  assert.throws(() => verifyAccessToken('not-a-real-jwt'));
});
