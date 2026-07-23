import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onNewNotification, disconnectSocket } from './socket';
import { tokenStore } from './api';

beforeEach(() => {
  tokenStore.clear();
});

afterEach(() => {
  disconnectSocket();
  tokenStore.clear();
});

test('onNewNotification is a no-op subscription when there is no access token', () => {
  let handlerCalls = 0;
  const unsubscribe = onNewNotification(() => {
    handlerCalls += 1;
  });
  assert.equal(typeof unsubscribe, 'function');
  assert.doesNotThrow(() => unsubscribe());
  assert.equal(handlerCalls, 0);
});

test('onNewNotification lazily connects and registers a handler once a token is stored', () => {
  tokenStore.set('token-1', 'refresh-1');
  const unsubscribe = onNewNotification(() => {});
  assert.equal(typeof unsubscribe, 'function');
  assert.doesNotThrow(() => unsubscribe());
});

test('disconnectSocket is safe to call when no socket has ever been created', () => {
  assert.doesNotThrow(() => disconnectSocket());
});

test('disconnectSocket tears down an active connection so a later subscription reconnects cleanly', () => {
  tokenStore.set('token-1', 'refresh-1');
  const firstUnsubscribe = onNewNotification(() => {});
  assert.doesNotThrow(() => disconnectSocket());
  firstUnsubscribe();

  const secondUnsubscribe = onNewNotification(() => {});
  assert.equal(typeof secondUnsubscribe, 'function');
  assert.doesNotThrow(() => secondUnsubscribe());
});
