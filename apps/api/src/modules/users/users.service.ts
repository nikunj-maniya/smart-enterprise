import { Prisma, UserStatus } from '@prisma/client';
import type { PlatformUserDto, PlatformUsersQuery, PlatformUsersResponse } from '@se/shared';
import { prisma } from '../../prisma.js';

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
      include: { tenant: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    rows: rows.map(
      (u): PlatformUserDto => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.isSystemAdmin ? 'System Admin' : 'Enterprise Admin',
        // tenant is guaranteed non-null by the tenantId-not-null filter above.
        enterpriseName: u.tenant!.name,
        status: u.status as PlatformUserDto['status'],
        createdAt: u.createdAt.toISOString(),
      }),
    ),
    total,
    page,
    pageSize,
  };
}
