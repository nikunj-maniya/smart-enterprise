import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { Prisma, UserStatus } from '@prisma/client';
import type {
  AdminResetPasswordResponse,
  PlatformUserDto,
  PlatformUsersQuery,
  PlatformUsersResponse,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

export async function listPlatformUsers(
  query: PlatformUsersQuery,
): Promise<PlatformUsersResponse> {
  const { page, pageSize, search, status, tenantId } = query;

  // Cross-enterprise list excludes the platform System Admin (tenantId null) —
  // only users belonging to an enterprise are shown.
  const where: Prisma.UserWhereInput = {
    tenantId: tenantId ?? { not: null },
    ...(status ? { status: status as UserStatus } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { tenant: true, roles: { include: { role: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    rows: rows.map((u): PlatformUserDto => {
      const roleNames = u.roles.map((ur) => ur.role.name).sort();
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.isSystemAdmin ? 'System Admin' : roleNames.length ? roleNames.join(', ') : 'No role',
        // tenant is guaranteed non-null by the tenantId-not-null filter above.
        enterpriseName: u.tenant!.name,
        status: u.status as PlatformUserDto['status'],
        createdAt: u.createdAt.toISOString(),
      };
    }),
    total,
    page,
    pageSize,
  };
}

/** Admin-initiated reset — the no-email fallback (D-30). Issues a one-time temporary password. */
export async function adminResetPassword(
  userId: string,
  actorId: string,
): Promise<AdminResetPasswordResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');
  if (user.isSystemAdmin) throw new HttpError(400, 'Cannot reset a System Admin account this way');

  const temporaryPassword = randomBytes(9).toString('base64url');
  const passwordHash = await argon2.hash(temporaryPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true } }),
    prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId,
        entity: 'User',
        entityId: user.id,
        action: 'password_reset',
      },
    }),
  ]);

  return { temporaryPassword };
}
