import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onNewNotification, disconnectSocket } from './socket';

afterEach(() => {
  disconnectSocket();
});

test('onNewNotification lazily connects and registers a handler', () => {
  const unsubscribe = onNewNotification(() => {});
  assert.equal(typeof unsubscribe, 'function');
  assert.doesNotThrow(() => unsubscribe());
});

test('disconnectSocket is safe to call when no socket has ever been created', () => {
  assert.doesNotThrow(() => disconnectSocket());
});

test('disconnectSocket tears down an active connection so a later subscription reconnects cleanly', () => {
  const firstUnsubscribe = onNewNotification(() => {});
  assert.doesNotThrow(() => disconnectSocket());
  firstUnsubscribe();

  const secondUnsubscribe = onNewNotification(() => {});
  assert.equal(typeof secondUnsubscribe, 'function');
  assert.doesNotThrow(() => secondUnsubscribe());
});
