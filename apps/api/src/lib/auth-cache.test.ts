import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../prisma.js';
import { cacheRedis } from './cache-redis.js';
import { resolveAuthedUser } from './auth-cache.js';

/** In-memory stand-in for the Redis GET/SET pair `resolveAuthedUser` uses as its cache. */
let store: Map<string, string>;
let findUniqueArgs: unknown[] = [];
let userRow: {
  id: string;
  email: string;
  isSystemAdmin: boolean;
  tenantId: string | null;
  status: string;
  tenant: { status: string } | null;
  roles: Array<{ role: { key: string } }>;
} | null;

Object.defineProperty(cacheRedis, 'get', {
  value: async (key: string) => store.get(key) ?? null,
  configurable: true,
});
Object.defineProperty(cacheRedis, 'set', {
  value: async (key: string, value: string) => {
    store.set(key, value);
    return 'OK';
  },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: {
    findUnique: async (args: unknown) => {
      findUniqueArgs.push(args);
      return userRow;
    },
  },
  configurable: true,
});

beforeEach(() => {
  store = new Map();
  findUniqueArgs = [];
  userRow = null;
});

test('resolveAuthedUser returns the cached projection without querying the database on a cache hit', async () => {
  store.set('auth:user:u1', JSON.stringify({ id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['employee'] }));

  const result = await resolveAuthedUser('u1');

  assert.deepEqual(result, { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['employee'] });
  assert.equal(findUniqueArgs.length, 0);
});

test('resolveAuthedUser queries and caches on a miss, projecting role keys', async () => {
  userRow = {
    id: 'u2',
    email: 'b@c.d',
    isSystemAdmin: false,
    tenantId: 't1',
    status: 'Active',
    tenant: { status: 'Active' },
    roles: [{ role: { key: 'enterprise_admin' } }, { role: { key: 'employee' } }],
  };

  const result = await resolveAuthedUser('u2');

  assert.deepEqual(result, {
    id: 'u2',
    email: 'b@c.d',
    isSystemAdmin: false,
    tenantId: 't1',
    roles: ['enterprise_admin', 'employee'],
  });
  assert.deepEqual(JSON.parse(store.get('auth:user:u2')!), result);
});

test('resolveAuthedUser returns null and does not cache when the user does not exist', async () => {
  userRow = null;
  const result = await resolveAuthedUser('missing');
  assert.equal(result, null);
  assert.equal(store.has('auth:user:missing'), false);
});

test('resolveAuthedUser returns null for a non-Active user', async () => {
  userRow = {
    id: 'u3',
    email: 'c@d.e',
    isSystemAdmin: false,
    tenantId: 't1',
    status: 'Suspended',
    tenant: { status: 'Active' },
    roles: [],
  };
  const result = await resolveAuthedUser('u3');
  assert.equal(result, null);
  assert.equal(store.has('auth:user:u3'), false);
});

test('resolveAuthedUser returns null when the user\'s tenant is Suspended', async () => {
  userRow = {
    id: 'u4',
    email: 'd@e.f',
    isSystemAdmin: false,
    tenantId: 't1',
    status: 'Active',
    tenant: { status: 'Suspended' },
    roles: [],
  };
  const result = await resolveAuthedUser('u4');
  assert.equal(result, null);
});

test('resolveAuthedUser allows a platform System Admin, whose tenant is always null', async () => {
  userRow = {
    id: 'sysadmin',
    email: 'admin@platform',
    isSystemAdmin: true,
    tenantId: null,
    status: 'Active',
    tenant: null,
    roles: [],
  };
  const result = await resolveAuthedUser('sysadmin');
  assert.deepEqual(result, { id: 'sysadmin', email: 'admin@platform', isSystemAdmin: true, tenantId: null, roles: [] });
});
