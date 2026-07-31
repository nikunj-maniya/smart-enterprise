import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { Prisma, TenantStatus, UserStatus } from '@prisma/client';
import type {
  EnterpriseRegistrationDto,
  RegisterEnterpriseRequest,
  RegistrationsQuery,
  RegistrationsResponse,
} from '@se/shared';
import { AuditAction, RegistrationStatus } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { getSettings } from '../settings/settings.service.js';
import {
  grantEnterpriseAdminRole,
  initializeUserLeaveBalances,
  seedTenantEscalationDefaults,
  seedTenantItemCatalog,
  seedTenantLeaveTypes,
  seedTenantOrgDefaults,
} from '../org-masters/seed.service.js';
import { seedTenantCoreForms } from '../forms/forms.seed.js';

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
  const settings = await getSettings();
  if (!settings.allowPublicRegistration) {
    throw new HttpError(403, 'Public enterprise registration is currently disabled.');
  }

  const existing = await prisma.user.findUnique({ where: { email: input.contactEmail } });
  // Resolve the same way whether or not the email is already registered — avoids email
  // enumeration, same pattern as requestPasswordReset/registerViaToken. The frontend never reads
  // the returned id (it only shows a static "submitted" confirmation), so a random one is fine.
  if (existing) {
    await argon2.hash(input.password); // pad timing to match the real-path cost below
    return { id: randomUUID() };
  }

  const passwordHash = await argon2.hash(input.password);
  const registration = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.companyName,
        industry: input.industry,
        size: input.size,
        website: input.website,
        status: TenantStatus.Pending,
      },
    });
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: input.contactName,
        email: input.contactEmail,
        passwordHash,
        status: UserStatus.Pending,
        isSystemAdmin: false,
        mustChangePassword: settings.forcePasswordChangeOnFirstLogin,
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
        status: RegistrationStatus.Pending,
      },
    });

    if (settings.notifyOnNewRegistration) {
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
    }

    return reg;
  });

  return { id: registration.id };
}

export async function listRegistrations(
  query: RegistrationsQuery,
): Promise<RegistrationsResponse> {
  const { page, pageSize, search, status } = query;

  const where: Prisma.EnterpriseRegistrationWhereInput = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { companyName: { contains: search, mode: 'insensitive' } },
            { contactName: { contains: search, mode: 'insensitive' } },
            { contactEmail: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.enterpriseRegistration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.enterpriseRegistration.count({ where }),
  ]);

  return {
    rows: rows.map(toDto),
    total,
    page,
    pageSize,
  };
}

export async function acceptRegistration(
  id: string,
  actorId: string,
): Promise<EnterpriseRegistrationDto> {
  const reg = await prisma.enterpriseRegistration.findUnique({ where: { id } });
  if (!reg) throw new HttpError(404, 'Registration not found');
  if (reg.status !== RegistrationStatus.Pending) {
    throw new HttpError(409, 'Registration has already been reviewed');
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: reg.tenantId }, data: { status: TenantStatus.Active } });
    await tx.user.update({ where: { id: reg.userId }, data: { status: UserStatus.Active } });
    await seedTenantOrgDefaults(tx, reg.tenantId);
    await seedTenantEscalationDefaults(tx, reg.tenantId);
    await seedTenantLeaveTypes(tx, reg.tenantId);
    await seedTenantItemCatalog(tx, reg.tenantId);
    await seedTenantCoreForms(tx, reg.tenantId, actorId);
    await grantEnterpriseAdminRole(tx, reg.tenantId, reg.userId);
    await initializeUserLeaveBalances(tx, reg.tenantId, reg.userId);
    const updatedReg = await tx.enterpriseRegistration.update({
      where: { id },
      data: { status: RegistrationStatus.Accepted, reviewedBy: actorId },
    });
    await tx.auditLog.create({
      data: {
        tenantId: reg.tenantId,
        actorId,
        entity: 'Tenant',
        entityId: reg.tenantId,
        action: AuditAction.Accept,
        before: { status: TenantStatus.Pending },
        after: { status: TenantStatus.Active },
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
  if (reg.status !== RegistrationStatus.Pending) {
    throw new HttpError(409, 'Registration has already been reviewed');
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: reg.tenantId }, data: { status: TenantStatus.Rejected } });
    await tx.user.update({ where: { id: reg.userId }, data: { status: UserStatus.Inactive } });
    const updatedReg = await tx.enterpriseRegistration.update({
      where: { id },
      data: { status: RegistrationStatus.Rejected, reviewedBy: actorId, reviewNote: reason },
    });
    await tx.auditLog.create({
      data: {
        tenantId: reg.tenantId,
        actorId,
        entity: 'Tenant',
        entityId: reg.tenantId,
        action: AuditAction.Reject,
        before: { status: TenantStatus.Pending },
        after: { status: TenantStatus.Rejected, reason },
      },
    });
    return updatedReg;
  });

  return toDto(updated);
}
