import { UserStatus } from '@prisma/client';
import type {
  DirectoryProjectDto,
  DirectoryProjectsQuery,
  DirectoryUserDto,
  DirectoryUsersQuery,
} from '@se/shared';
import { prisma } from '../../prisma.js';

/**
 * Searchable, tenant-scoped user directory backing `user-picker` fields (PRD §6.3).
 * Active users only, optionally narrowed to a field's `pickerConfig.roles`/`.departments`.
 */
export async function searchDirectoryUsers(
  tenantId: string,
  query: DirectoryUsersQuery,
): Promise<DirectoryUserDto[]> {
  const { search, roles, departments, limit } = query;

  const rows = await prisma.user.findMany({
    where: {
      tenantId,
      status: UserStatus.Active,
      ...(roles ? { roles: { some: { role: { key: { in: roles } } } } } : {}),
      ...(departments ? { departments: { some: { departmentId: { in: departments } } } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
    take: limit,
  });

  return rows;
}

/** Searchable, tenant-scoped project directory backing `project-picker` fields. Active projects only. */
export async function searchDirectoryProjects(
  tenantId: string,
  query: DirectoryProjectsQuery,
): Promise<DirectoryProjectDto[]> {
  const { search, limit } = query;

  return prisma.project.findMany({
    where: {
      tenantId,
      status: 'active',
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: limit,
  });
}
