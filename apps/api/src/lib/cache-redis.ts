import { Redis } from 'ioredis';

/**
 * General-purpose Redis client for caching and the Socket.IO adapter — deliberately its own
 * module, separate from `redisConnection` in `redis.ts`, so BullMQ's blocking commands never
 * contend with regular GET/SET/pub-sub, and so importing this client (e.g. via the auth
 * middleware) never also pulls in BullMQ's connection as an import side effect.
 *
 * `lazyConnect` defers the actual socket until the first command, so modules that merely import
 * this file — including tests that import the auth middleware without ever exercising the
 * DB-backed path — don't open a connection or hang retrying one that isn't there.
 */
export const cacheRedis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,
});
