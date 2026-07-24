import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt.js';

test('signAccessToken/verifyAccessToken round-trips the user id', () => {
  const token = signAccessToken('user-1');
  assert.equal(verifyAccessToken(token).sub, 'user-1');
});

test('signRefreshToken/verifyRefreshToken round-trips the user id', () => {
  const token = signRefreshToken('user-2');
  assert.equal(verifyRefreshToken(token).sub, 'user-2');
});

test('verifyAccessToken rejects a token signed with the refresh secret', () => {
  const refreshToken = signRefreshToken('user-3');
  assert.throws(() => verifyAccessToken(refreshToken));
});

test('verifyRefreshToken rejects a token signed with the access secret', () => {
  const accessToken = signAccessToken('user-4');
  assert.throws(() => verifyRefreshToken(accessToken));
});

test('verifyAccessToken rejects an expired token', () => {
  const accessSecret = process.env.JWT_ACCESS_SECRET ?? 'change-me-access';
  const expired = jwt.sign({ sub: 'user-5' }, accessSecret, { expiresIn: -10 });
  assert.throws(() => verifyAccessToken(expired), /jwt expired/);
});

test('verifyAccessToken rejects a malformed token', () => {
  assert.throws(() => verifyAccessToken('not-a-real-jwt'));
});
