import argon2 from 'argon2';
import type {
  EnterpriseRegistrationDto,
  RegisterEnterpriseRequest,
  RegistrationStatus,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

function toDto(reg: {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  size: string | null;
  industry: string | null;
  website: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: Date;
}): EnterpriseRegistrationDto {
  return {
    id: reg.id,
    companyName: reg.companyName,
    contactName: reg.contactName,
    contactEmail: reg.contactEmail,
    size: reg.size,
    industry: reg.industry,
    website: reg.website,
    status: reg.status as RegistrationStatus,
    reviewNote: reg.reviewNote,
    createdAt: reg.createdAt.toISOString(),
  };
}

export async function submitRegistration(
  input: RegisterEnterpriseRequest,
): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({ where: { email: input.contactEmail } });
  if (existing) {
    if (existing.status === 'Inactive') {
      throw new HttpError(409, 'This email was previously rejected and cannot be used again.');
    }
    throw new HttpError(409, 'This email is already registered.');
  }

  const passwordHash = await argon2.hash(input.password);
  const registration = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: input.companyName, status: 'Pending' },
    });
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: input.contactName,
        email: input.contactEmail,
        passwordHash,
        status: 'Pending',
        isSystemAdmin: false,
      },
    });
    const reg = await tx.enterpriseRegistration.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        companyName: input.companyName,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        size: input.size,
        industry: input.industry,
        website: input.website,
        status: 'Pending',
      },
    });

    const admins = await tx.user.findMany({ where: { isSystemAdmin: true }, select: { id: true } });
    if (admins.length > 0) {
      await tx.notification.createMany({
        data: admins.map((admin) => ({
          tenantId: tenant.id,
          userId: admin.id,
          type: 'enterprise_registered',
          payload: { registrationId: reg.id, companyName: input.companyName },
          read: false,
        })),
      });
    }

    return reg;
  });

  return { id: registration.id };
}

export async function listRegistrations(
  status?: RegistrationStatus,
): Promise<EnterpriseRegistrationDto[]> {
  const rows = await prisma.enterpriseRegistration.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDto);
}

export async function acceptRegistration(
  id: string,
  actorId: string,
): Promise<EnterpriseRegistrationDto> {
  const reg = await prisma.enterpriseRegistration.findUnique({ where: { id } });
  if (!reg) throw new HttpError(404, 'Registration not found');
  if (reg.status !== 'Pending') throw new HttpError(409, 'Registration has already been reviewed');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: reg.tenantId }, data: { status: 'Active' } });
    await tx.user.update({ where: { id: reg.userId }, data: { status: 'Active' } });
    const updatedReg = await tx.enterpriseRegistration.update({
      where: { id },
      data: { status: 'Accepted', reviewedBy: actorId },
    });
    await tx.auditLog.create({
      data: {
        tenantId: reg.tenantId,
        actorId,
        entity: 'Tenant',
        entityId: reg.tenantId,
        action: 'accept',
        before: { status: 'Pending' },
        after: { status: 'Active' },
      },
    });
    return updatedReg;
  });

  return toDto(updated);
}

export async function rejectRegistration(
  id: string,
  actorId: string,
  reason: string,
): Promise<EnterpriseRegistrationDto> {
  const reg = await prisma.enterpriseRegistration.findUnique({ where: { id } });
  if (!reg) throw new HttpError(404, 'Registration not found');
  if (reg.status !== 'Pending') throw new HttpError(409, 'Registration has already been reviewed');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: reg.tenantId }, data: { status: 'Rejected' } });
    await tx.user.update({ where: { id: reg.userId }, data: { status: 'Inactive' } });
    const updatedReg = await tx.enterpriseRegistration.update({
      where: { id },
      data: { status: 'Rejected', reviewedBy: actorId, reviewNote: reason },
    });
    await tx.auditLog.create({
      data: {
        tenantId: reg.tenantId,
        actorId,
        entity: 'Tenant',
        entityId: reg.tenantId,
        action: 'reject',
        before: { status: 'Pending' },
        after: { status: 'Rejected', reason },
      },
    });
    return updatedReg;
  });

  return toDto(updated);
}
