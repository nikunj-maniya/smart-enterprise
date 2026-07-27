import { describe, it, test, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server, type Socket } from 'socket.io';
import { prisma } from '../prisma.js';
import { cacheRedis } from './cache-redis.js';
import { signAccessToken } from './jwt.js';
import { emitToUser, initSocketServer } from './socket.js';

/**
 * socket.ts keeps its `io` instance module-private, so the only way to exercise the handshake
 * auth middleware it registers via `io.use(...)` is to capture the callback at the point of
 * registration — `Server.prototype.use` is overridden the same way the Prisma delegate stubs
 * work (shared prototype, not a per-instance property). `cacheRedis.duplicate` is stubbed to
 * return a harmless fake client (just enough surface for `@socket.io/redis-adapter` to construct
 * against — `psubscribe`/`subscribe`/`on`) so `initSocketServer` never opens a real Redis
 * connection, and `Server.prototype.to` is captured so `emitToUser`'s room targeting can be
 * asserted without a live connection.
 */
let capturedMiddleware: ((socket: Socket, next: (err?: Error) => void) => Promise<void>) | undefined;
let toCalls: Array<{ room: string; emits: Array<{ event: string; payload: unknown }> }>;

function fakeRedisClient() {
  return { psubscribe: () => {}, subscribe: () => {}, on: () => {} };
}
Object.defineProperty(cacheRedis, 'duplicate', { value: fakeRedisClient, configurable: true });

Object.defineProperty(Server.prototype, 'use', {
  value: function (this: Server, fn: typeof capturedMiddleware) {
    capturedMiddleware = fn;
    return this;
  },
  configurable: true,
});
Object.defineProperty(Server.prototype, 'to', {
  value: function (room: string) {
    const record = { room, emits: [] as Array<{ event: string; payload: unknown }> };
    toCalls.push(record);
    return { emit: (event: string, payload: unknown) => record.emits.push({ event, payload }) };
  },
  configurable: true,
});

let userRow: { id: string; email: string; isSystemAdmin: boolean; tenantId: string | null; status: string; tenant: { status: string } | null; roles: unknown[] } | null;
Object.defineProperty(prisma, 'user', {
  value: { findUnique: async () => userRow },
  configurable: true,
});
Object.defineProperty(cacheRedis, 'get', { value: async () => null, configurable: true });
Object.defineProperty(cacheRedis, 'set', { value: async () => 'OK', configurable: true });

function fakeSocket(token?: string, cookieHeader?: string): Socket {
  return { handshake: { auth: { token }, headers: { cookie: cookieHeader } }, data: {} } as unknown as Socket;
}

function invokeMiddleware(token?: string): Promise<Error | undefined> {
  return new Promise((resolve) => {
    const socket = fakeSocket(token);
    void capturedMiddleware!(socket, (err) => resolve(err));
  });
}

test('emitToUser is a no-op before initSocketServer has ever run', () => {
  assert.doesNotThrow(() => emitToUser('u1', 'notification:new', { a: 1 }));
});

describe('socket auth handshake (after initSocketServer)', () => {
  before(() => {
    initSocketServer(http.createServer());
  });

  it('rejects a handshake with no token', async () => {
    const err = await invokeMiddleware(undefined);
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'Unauthorized');
  });

  it('rejects a handshake with a malformed/invalid-signature token', async () => {
    const err = await invokeMiddleware('not-a-real-jwt');
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'Unauthorized');
  });

  it('rejects a valid token whose user resolves to inactive/not-found', async () => {
    userRow = null;
    const token = signAccessToken('inactive-user');
    const socket = fakeSocket(token);
    const err = await new Promise<Error | undefined>((resolve) => {
      void capturedMiddleware!(socket, (e) => resolve(e));
    });
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'Unauthorized');
    assert.equal(socket.data.userId, undefined);
  });

  it('accepts a valid token for an active user and attaches their id to the socket', async () => {
    userRow = {
      id: 'active-user',
      email: 'a@b.c',
      isSystemAdmin: false,
      tenantId: 't1',
      status: 'Active',
      tenant: { status: 'Active' },
      roles: [],
    };
    const token = signAccessToken('active-user');
    const socket = fakeSocket(token);
    const err = await new Promise<Error | undefined>((resolve) => {
      void capturedMiddleware!(socket, (e) => resolve(e));
    });
    assert.equal(err, undefined);
    assert.equal(socket.data.userId, 'active-user');
  });

  it('accepts a valid token carried in the se_access cookie instead of auth.token (finding #6 — no JS-readable token to pass)', async () => {
    userRow = {
      id: 'cookie-user',
      email: 'a@b.c',
      isSystemAdmin: false,
      tenantId: 't1',
      status: 'Active',
      tenant: { status: 'Active' },
      roles: [],
    };
    const token = signAccessToken('cookie-user');
    const socket = fakeSocket(undefined, `se_access=${token}; se_csrf=unrelated-value`);
    const err = await new Promise<Error | undefined>((resolve) => {
      void capturedMiddleware!(socket, (e) => resolve(e));
    });
    assert.equal(err, undefined);
    assert.equal(socket.data.userId, 'cookie-user');
  });

  it('emitToUser targets the room named after the user id', () => {
    toCalls = [];
    emitToUser('user-42', 'notification:new', { hello: 'world' });
    assert.equal(toCalls.length, 1);
    assert.equal(toCalls[0].room, 'user:user-42');
    assert.deepEqual(toCalls[0].emits, [{ event: 'notification:new', payload: { hello: 'world' } }]);
  });
});
