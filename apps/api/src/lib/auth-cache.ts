import { TenantStatus, UserStatus } from '@prisma/client';
import { prisma } from '../prisma.js';
import { cacheRedis } from './cache-redis.js';
import type { AuthedUser } from '../middleware/auth.js';

const TTL_SECONDS = 30;

function cacheKey(userId: string): string {
  return `auth:user:${userId}`;
}

/**
 * Resolves the authed-user projection for a userId, backed by a short-lived Redis cache so the
 * user+tenant+roles join doesn't run on every request and every socket handshake. The 30s TTL
 * bounds how long a suspended user or role change takes to take effect, which is short enough
 * that we don't need invalidation hooks in every place a user/role gets mutated.
 */
export async function resolveAuthedUser(userId: string): Promise<AuthedUser | null> {
  const key = cacheKey(userId);
  const cached = await cacheRedis.get(key);
  if (cached) return JSON.parse(cached) as AuthedUser;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: true, roles: { include: { role: true } } },
  });
  if (!user || user.status !== UserStatus.Active || user.tenant?.status === TenantStatus.Suspended) {
    return null;
  }

  const authedUser: AuthedUser = {
    id: user.id,
    email: user.email,
    isSystemAdmin: user.isSystemAdmin,
    tenantId: user.tenantId,
    roles: user.roles.map((ur) => ur.role.key),
  };
  await cacheRedis.set(key, JSON.stringify(authedUser), 'EX', TTL_SECONDS);
  return authedUser;
}
