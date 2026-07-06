import type { ProfileDto, UpdateProfileRequest } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

const withRolesAndDepartments = {
  roles: { include: { role: { select: { name: true } } } },
  departments: { include: { department: { select: { name: true } } } },
} as const;

function toDto(u: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  location: string | null;
  roles: { role: { name: string } }[];
  departments: { department: { name: string } }[];
}): ProfileDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    jobTitle: u.jobTitle,
    location: u.location,
    roles: u.roles.map((r) => r.role.name),
    departments: u.departments.map((d) => d.department.name),
  };
}

export async function getProfile(userId: string): Promise<ProfileDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: withRolesAndDepartments,
  });
  if (!user) throw new HttpError(404, 'User not found');
  return toDto(user);
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileRequest,
): Promise<ProfileDto> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      phone: input.phone ?? null,
      jobTitle: input.jobTitle ?? null,
      location: input.location ?? null,
    },
    include: withRolesAndDepartments,
  });
  return toDto(updated);
}
