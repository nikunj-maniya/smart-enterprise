import { Redis } from 'ioredis';

/**
 * Shared BullMQ connection. `maxRetriesPerRequest: null` is required by BullMQ — it issues
 * blocking Redis commands that must be allowed to retry indefinitely rather than fail fast.
 */
export const redisConnection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
