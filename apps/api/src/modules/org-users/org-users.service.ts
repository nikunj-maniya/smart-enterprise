import { UserStatus } from '@prisma/client';
import type { OrgUserPickerDto } from '@se/shared';
import { prisma } from '../../prisma.js';

/** Minimal tenant-scoped user list for pickers (e.g. department head). Full CRUD lands in Slice 4. */
export async function listOrgUsersForPicker(tenantId: string): Promise<OrgUserPickerDto[]> {
  return prisma.user.findMany({
    where: { tenantId, status: UserStatus.Active },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
