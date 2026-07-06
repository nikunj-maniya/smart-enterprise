import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { TenantStatus, UserStatus } from '@prisma/client';
import { SystemRoleKey } from '@se/shared';
import type {
  RegistrationLinkDto,
  SelfRegisterRequest,
  SelfRegistrationInfo,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

function joinUrl(token: string): string {
  return `${process.env.WEB_URL ?? 'http://localhost:5173'}/join/${token}`;
}

function toDto(link: { token: string; expiresAt: Date }): RegistrationLinkDto {
  return {
    url: joinUrl(link.token),
    expiresAt: link.expiresAt.toISOString(),
    expired: link.expiresAt.getTime() < Date.now(),
  };
}

export async function getLink(tenantId: string): Promise<RegistrationLinkDto | null> {
  const link = await prisma.registrationLink.findUnique({ where: { tenantId } });
  return link ? toDto(link) : null;
}

export async function generateLink(
  tenantId: string,
  actorId: string,
  expiryMinutes: number,
): Promise<RegistrationLinkDto> {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // At most one active link per tenant — regenerating replaces the old one (revokes it).
  const link = await prisma.$transaction(async (tx) => {
    const created = await tx.registrationLink.upsert({
      where: { tenantId },
      create: { tenantId, token, expiresAt, createdBy: actorId },
      update: { token, expiresAt, createdBy: actorId },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'RegistrationLink',
        entityId: created.id,
        action: 'generate',
        after: { expiresAt: expiresAt.toISOString() },
      },
    });
    return created;
  });

  return toDto(link);
}

export async function revokeLink(tenantId: string, actorId: string): Promise<void> {
  const link = await prisma.registrationLink.findUnique({ where: { tenantId } });
  if (!link) return; // already gone — idempotent

  await prisma.$transaction([
    prisma.registrationLink.delete({ where: { tenantId } }),
    prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'RegistrationLink',
        entityId: link.id,
        action: 'revoke',
      },
    }),
  ]);
}

/** Resolves a token to its (unexpired) link and active tenant, or throws the right refusal. */
async function resolveActiveLink(token: string) {
  const link = await prisma.registrationLink.findUnique({
    where: { token },
    include: { tenant: true },
  });
  if (!link || link.expiresAt.getTime() < Date.now()) {
    throw new HttpError(410, 'This registration link is invalid or has expired.');
  }
  if (link.tenant.status !== TenantStatus.Active) {
    throw new HttpError(410, 'This registration link is no longer available.');
  }
  return link;
}

export async function getPublicInfo(token: string): Promise<SelfRegistrationInfo> {
  const link = await resolveActiveLink(token);
  return { tenantName: link.tenant.name };
}

export async function registerViaToken(
  token: string,
  input: SelfRegisterRequest,
): Promise<void> {
  const link = await resolveActiveLink(token);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new HttpError(409, 'This email is already registered.');

  const employeeRole = await prisma.role.findUnique({
    where: { tenantId_key: { tenantId: link.tenantId, key: SystemRoleKey.Employee } },
  });
  if (!employeeRole) throw new HttpError(500, 'Employee role is not configured for this enterprise');

  const passwordHash = await argon2.hash(input.password);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: link.tenantId,
        name: input.name,
        email: input.email,
        passwordHash,
        // Self-registrations await Enterprise Admin approval before they can log in.
        status: UserStatus.Pending,
        mustChangePassword: false, // self-registrant chose their own password
        roles: { create: [{ roleId: employeeRole.id }] },
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: link.tenantId,
        actorId: user.id,
        entity: 'User',
        entityId: user.id,
        action: 'self_register',
        after: { name: user.name, email: user.email, status: UserStatus.Pending },
      },
    });
  });
}
